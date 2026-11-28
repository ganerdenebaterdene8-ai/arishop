// АриШоп — барааны зургаас 360° 3D загвар автоматаар үүсгэх.
// .github/workflows/make-3d.yml өдөр бүр ажиллуулна (гараар ч болно).
//
// Урсгал:
//   1. Firestore `prices` → бараа бүрийн зураг (sync-prices Naver/Coupang-аас тавьсан)
//   2. Загваргүй бараанд Meshy Image-to-3D даалгавар үүсгэнэ (өдөрт MAX_NEW хүртэл — кредит хамгаална)
//   3. Бэлэн болсон загварыг татаж, gltf-transform-оор шахаж (draco + webp 1024px) жижигрүүлнэ
//   4. Vercel Blob-д хадгалж, URL-ийг Firestore `prices/<нэр>.model3d`-д бичнэ
//   5. Сайт (viewer360.js) model3d-тэй бараанд "360°" товч гаргана
//
// Нууц түлхүүрүүд (GitHub → Settings → Secrets → Actions):
//   MESHY_API_KEY, FIREBASE_API_KEY, BLOB_READ_WRITE_TOKEN
// Тохиргоо (env): MAX_NEW (өдөрт шинэ загвар, анхдагч 5), ONLY (зөвхөн энэ бараа), REMOVE (энэ барааны загварыг нуух)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

// api/_catalog.js нь ESM боловч package.json-гүй тул .mjs хуулбараар уншина
const CAT_SRC = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../api/_catalog.js');
const CAT_TMP = path.join(os.tmpdir(), 'arishop-catalog.mjs');
fs.copyFileSync(CAT_SRC, CAT_TMP);
const CATALOG = (await import('file://' + CAT_TMP)).default;

const PROJECT = 'arishop-2671a';
const FS = 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents/prices';
const MESHY = 'https://api.meshy.ai/openapi/v1';
const FB_KEY = process.env.FIREBASE_API_KEY;
const MESHY_KEY = process.env.MESHY_API_KEY;
const MAX_NEW = Math.max(0, Number(process.env.MAX_NEW || 5));
const ONLY = (process.env.ONLY || '').trim();
const REMOVE = (process.env.REMOVE || '').trim();
const MAX_TRIES = 2;              // нэг бараанд хэдэн удаа оролдох
const CREDITS_PER_TASK = 30;      // өнгө + PBR-тэй загвар
const MAX_BYTES = 15 * 1024 * 1024;
const WAIT_MS = 25 * 60 * 1000;   // шинэ даалгавруудыг энэ ажиллалтад дуусгахыг хүлээх дээд хугацаа
const RUNNING = new Set(['PENDING', 'IN_PROGRESS', 'UPLOAD_FAILED']); // UPLOAD_FAILED: Meshy бэлэн, зөвхөн татах/хадгалахыг дахин оролдоно (кредит дахин зарцуулахгүй)

const log = [];
const note = (s) => { console.log(s); log.push(s); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function summary() {
  const f = process.env.GITHUB_STEP_SUMMARY;
  if (f) fs.appendFileSync(f, '## 3D загвар\n\n' + log.map((l) => '- ' + l).join('\n') + '\n');
}

// ---------- Firestore ----------
const val = (f) => (f == null ? undefined : f.stringValue ?? (f.integerValue != null ? Number(f.integerValue) : f.doubleValue ?? f.booleanValue));

async function listPrices() {
  const out = [];
  let token = '';
  do {
    const r = await fetch(FS + '?pageSize=300&key=' + FB_KEY + (token ? '&pageToken=' + encodeURIComponent(token) : ''));
    if (!r.ok) throw new Error('firestore list ' + r.status + ' ' + (await r.text()).slice(0, 200));
    const d = await r.json();
    for (const doc of d.documents || []) {
      const f = doc.fields || {};
      const id = decodeURIComponent(doc.name.split('/').pop());
      const o = { id };
      for (const k of Object.keys(f)) o[k] = val(f[k]);
      o.name = o.name || id;
      out.push(o);
    }
    token = d.nextPageToken || '';
  } while (token);
  return out;
}

async function patch(id, data) {
  const fields = {};
  for (const [k, v] of Object.entries(data)) {
    fields[k] = typeof v === 'number' ? { integerValue: String(Math.round(v)) } : { stringValue: String(v ?? '') };
  }
  const mask = Object.keys(data).map((k) => 'updateMask.fieldPaths=' + k).join('&');
  const r = await fetch(FS + '/' + encodeURIComponent(id) + '?key=' + FB_KEY + '&' + mask, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }),
  });
  if (!r.ok) throw new Error('firestore patch ' + r.status + ' ' + (await r.text()).slice(0, 200));
}

// ---------- Meshy ----------
async function meshy(method, p, body) {
  const r = await fetch(MESHY + p, {
    method,
    headers: { Authorization: 'Bearer ' + MESHY_KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) {
    const e = new Error('meshy ' + method + ' ' + p + ' → ' + r.status + ' ' + text.slice(0, 200));
    e.status = r.status;
    throw e;
  }
  return text ? JSON.parse(text) : {};
}

async function balance() {
  try { const d = await meshy('GET', '/balance'); return Number(d.balance); } catch (e) { note('⚠️ Кредитийн үлдэгдэл шалгаж чадсангүй: ' + e.message); return NaN; }
}

// ---------- Загвар боловсруулах ----------
async function finish(doc, task) {
  const glbUrl = task.model_urls && task.model_urls.glb;
  if (!glbUrl) throw new Error('GLB файл ирээгүй');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm3d-'));
  const raw = path.join(dir, 'raw.glb');
  const opt = path.join(dir, 'opt.glb');
  const r = await fetch(glbUrl);
  if (!r.ok) throw new Error('GLB татахад ' + r.status);
  fs.writeFileSync(raw, Buffer.from(await r.arrayBuffer()));
  let file = raw;
  try {
    execFileSync('npx', ['-y', '@gltf-transform/cli@4', 'optimize', raw, opt,
      '--compress', 'draco', '--texture-compress', 'webp', '--texture-size', '1024', '--simplify', 'false'], { stdio: 'pipe', timeout: 5 * 60 * 1000 });
    if (fs.existsSync(opt) && fs.statSync(opt).size > 0) file = opt;
  } catch (e) {
    note('⚠️ ' + doc.name + ': шахалт амжилтгүй, эх файлыг ашиглана');
  }
  const size = fs.statSync(file).size;
  if (size > MAX_BYTES) throw new Error('файл хэт том (' + (size / 1e6).toFixed(1) + 'MB)');
  const { put } = await import('@vercel/blob');
  const key = 'models/' + crypto.createHash('sha1').update(doc.id).digest('hex').slice(0, 12) + '-' + String(task.id).slice(0, 8) + '.glb';
  const blob = await put(key, fs.readFileSync(file), {
    access: 'public', contentType: 'model/gltf-binary', addRandomSuffix: false, allowOverwrite: true,
    cacheControlMaxAge: 60 * 60 * 24 * 365,
  });
  await patch(doc.id, { model3d: blob.url, model3dStatus: 'SUCCEEDED', model3dUpdated: Date.now(), model3dTries: 0, model3dError: '' });
  fs.rmSync(dir, { recursive: true, force: true });
  note('✅ ' + doc.name + ' — 3D бэлэн (' + (size / 1e6).toFixed(1) + 'MB)');
}

async function poll(doc) {
  const task = await meshy('GET', '/image-to-3d/' + doc.model3dTask);
  if (task.status === 'SUCCEEDED') {
    try { await finish(doc, task); }
    catch (e) {
      const tries = (doc.model3dTries || 0) + 1;
      if (tries >= 3) {
        await patch(doc.id, { model3dStatus: 'FAILED', model3dTask: '', model3dTries: tries, model3dError: e.message.slice(0, 200) });
        note('❌ ' + doc.name + ': ' + e.message);
      } else {
        // Загвар Meshy дээр бэлэн — дараагийн ажиллалтад зөвхөн татах/хадгалахыг дахин оролдоно
        await patch(doc.id, { model3dStatus: 'UPLOAD_FAILED', model3dTries: tries, model3dError: e.message.slice(0, 200) });
        note('⚠️ ' + doc.name + ': хадгалж чадсангүй (' + e.message + ') — дараа дахин оролдоно');
      }
    }
    return 'done';
  }
  if (task.status === 'FAILED' || task.status === 'CANCELED') {
    const err = (task.task_error && task.task_error.message) || task.status;
    await patch(doc.id, { model3dStatus: 'FAILED', model3dTask: '', model3dTries: (doc.model3dTries || 0) + 1, model3dError: String(err).slice(0, 200) });
    note('❌ ' + doc.name + ': Meshy ' + err);
    return 'done';
  }
  if (task.status !== doc.model3dStatus && doc.model3dStatus !== 'UPLOAD_FAILED') await patch(doc.id, { model3dStatus: task.status });
  doc.model3dStatus = task.status;
  return 'running';
}

async function start(doc) {
  const d = await meshy('POST', '/image-to-3d', {
    image_url: doc.image,
    should_texture: true,
    enable_pbr: true,
    should_remesh: true,
    target_polycount: 30000,
    target_formats: ['glb'],
  });
  const id = d.result;
  if (!id) throw new Error('даалгаврын дугаар ирээгүй');
  // model3d-г хоослоно: хуучирсан загвар шинэ зурагтай андуурагдаж харагдахгүй
  await patch(doc.id, { model3dTask: id, model3dStatus: 'PENDING', model3dImage: doc.image, model3dError: '', model3d: '' });
  doc.model3dTask = id; doc.model3dStatus = 'PENDING';
  note('🚀 ' + doc.name + ' — загвар үүсгэж эхэллээ');
}

// ---------- Үндсэн ----------
async function main() {
  if (!FB_KEY) { note('FIREBASE_API_KEY тохируулаагүй — зогслоо'); return; }
  if (!MESHY_KEY) { note('MESHY_API_KEY тохируулаагүй — GitHub → Settings → Secrets → Actions-д нэмнэ үү'); return; }
  if (!process.env.BLOB_READ_WRITE_TOKEN) { note('BLOB_READ_WRITE_TOKEN тохируулаагүй — Vercel → Storage → Blob үүсгээд токеныг GitHub Secrets-д нэмнэ үү'); return; }

  const docs = await listPrices();
  note('Firestore-д ' + docs.length + ' бараа, үүнээс ' + docs.filter((d) => d.model3d).length + ' нь 3D-тэй');

  if (REMOVE) {
    const d = docs.find((x) => x.name === REMOVE || x.id === REMOVE);
    if (d) { await patch(d.id, { model3d: '', model3dStatus: 'removed' }); note('🗑 ' + d.name + ' — 3D нуугдлаа (дахин үүсгэхгүй)'); }
    else note('⚠️ "' + REMOVE + '" нэртэй бараа олдсонгүй');
  }

  // 1. Явж буй даалгавруудыг шалгах
  for (const d of docs.filter((x) => x.model3dTask && RUNNING.has(x.model3dStatus))) {
    try { await poll(d); } catch (e) { note('⚠️ ' + d.name + ': ' + e.message); }
  }

  // 2. Шинэ даалгавар үүсгэх (каталогийн дарааллаар)
  const order = new Map(CATALOG.map((c, i) => [c[0], i]));
  const busy = (d) => !!(d.model3dTask && RUNNING.has(d.model3dStatus));
  // Хуучирсан загвар: үнэ шинэчлэлт өөр зарын зураг сонгосон (сайт ийм загварыг харуулахгүй)
  const stale = (d) => !!(d.model3d && d.model3dImage && d.image !== d.model3dImage);
  const rank = (d) => (order.get(d.name) ?? 1e9) + (stale(d) ? 1e10 : 0); // шинэ бараа эхэнд, хуучирсан нь сүүлд
  let cand = docs.filter((d) => d.image && (!d.model3d || stale(d)) && d.model3dStatus !== 'removed'
    && !busy(d) && (d.model3dTries || 0) < MAX_TRIES);
  if (ONLY) {
    cand = docs.filter((d) => (d.name === ONLY || d.id === ONLY) && d.image);
    if (!cand.length) note('⚠️ "' + ONLY + '" нэртэй зурагтай бараа олдсонгүй');
    else if (busy(cand[0])) { note('⏳ "' + ONLY + '" — загвар аль хэдийн үүсч байна, давхар үүсгэхгүй'); cand = []; }
  }
  cand.sort((a, b) => rank(a) - rank(b));
  cand = cand.slice(0, ONLY ? 1 : MAX_NEW);

  if (cand.length) {
    const bal = await balance();
    if (!Number.isNaN(bal)) {
      note('Meshy кредит: ' + bal);
      const can = Math.floor(bal / CREDITS_PER_TASK);
      if (can < cand.length) { note('⚠️ Кредит хүрэлцэхгүй — ' + can + ' бараа л эхлүүлнэ'); cand = cand.slice(0, can); }
    }
  }
  const started = [];
  for (const d of cand) {
    try { await start(d); started.push(d); }
    catch (e) {
      if (e.status === 402) { note('⚠️ Meshy кредит дууссан эсвэл төлбөртэй багц шаардлагатай (402) — зогслоо'); break; }
      note('❌ ' + d.name + ': ' + e.message);
    }
  }

  // 3. Шинэ даалгавруудыг энэ ажиллалтад дуусгахыг хүлээх
  const t0 = Date.now();
  let pending = started.slice();
  while (pending.length && Date.now() - t0 < WAIT_MS) {
    await sleep(20000);
    const next = [];
    for (const d of pending) {
      try { if ((await poll(d)) === 'running') next.push(d); } catch (e) { note('⚠️ ' + d.name + ': ' + e.message); next.push(d); }
    }
    pending = next;
  }
  if (pending.length) note('⏳ ' + pending.length + ' загвар үүсч дуусаагүй — дараагийн ажиллалтад шалгана');
}

try { await main(); }
catch (e) { note('❌ Алдаа: ' + e.message); summary(); process.exit(1); }
summary();
