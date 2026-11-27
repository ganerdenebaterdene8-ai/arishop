// АриШоп-ын долоо хоногийн статистик цуглуулагч.
// .github/workflows/weekly-stats.yml долоо хоног бүр ажиллуулж, үр дүнг `bot-data` салбарт
// reports/stats.json болгон хадгална. Claude-ийн хуваарьт ажил үүнийг уншиж сайжруулалт санал болгоно.
// Хувийн мэдээлэл (утас, хаяг, нэр) энд ОРОХГҮЙ — зөвхөн нийлбэр тоо.
// Орчны хувьсагч: FB_PAGE_ID, FB_PAGE_TOKEN, FIREBASE_API_KEY,
//                 KV_REST_API_URL, KV_REST_API_TOKEN (заавал биш — захиалгын тоонд)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const G = 'https://graph.facebook.com/v21.0/';
const FS = 'https://firestore.googleapis.com/v1/projects/arishop-2671a/databases/(default)/documents/prices/';
const WEEK = 7 * 86400000;
const now = Date.now();
const out = { generatedAt: new Date(now).toISOString(), facebook: null, orders: null, catalog: null, errors: [] };

async function loadCatalog() {
  const tmp = path.join(os.tmpdir(), 'catalog-' + process.pid + '.mjs');
  fs.copyFileSync(path.join(ROOT, 'api/_catalog.js'), tmp);
  return (await import(tmp)).default;
}

// 1) Facebook: сүүлийн 14 хоногийн постуудын оролцоо
async function facebook() {
  const { FB_PAGE_ID: PAGE, FB_PAGE_TOKEN: TOKEN } = process.env;
  if (!PAGE || !TOKEN) throw new Error('FB_PAGE_ID / FB_PAGE_TOKEN алга');
  const since = Math.floor((now - 2 * WEEK) / 1000);
  const fields = 'message,created_time,permalink_url,shares,reactions.summary(true).limit(0),comments.summary(true).limit(0)';
  const r = await fetch(G + PAGE + '/posts?limit=50&since=' + since + '&fields=' + encodeURIComponent(fields) + '&access_token=' + TOKEN);
  const d = await r.json();
  if (d.error) throw new Error('facebook: ' + d.error.message);
  const posts = (d.data || []).map((p) => ({
    date: p.created_time,
    text: String(p.message || '').slice(0, 300),
    url: p.permalink_url,
    reactions: p.reactions?.summary?.total_count || 0,
    comments: p.comments?.summary?.total_count || 0,
    shares: p.shares?.count || 0,
  }));
  posts.forEach((p) => (p.score = p.reactions + 3 * p.comments + 5 * p.shares));
  const fans = await fetch(G + PAGE + '?fields=followers_count,fan_count&access_token=' + TOKEN).then((x) => x.json()).catch(() => ({}));
  return { followers: fans.followers_count ?? fans.fan_count ?? null, posts: posts.sort((a, b) => b.score - a.score) };
}

// 2) Захиалга: нийлбэр тоо (Upstash Redis)
async function orders() {
  const URL = process.env.KV_REST_API_URL, TOKEN = process.env.KV_REST_API_TOKEN;
  if (!URL || !TOKEN) return { skipped: 'KV_REST_API_URL / KV_REST_API_TOKEN GitHub Secrets-д алга' };
  const cmd = async (...args) => {
    const r = await fetch(URL, { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN }, body: JSON.stringify(args) });
    const j = await r.json();
    if (j.error) throw new Error(j.error);
    return j.result;
  };
  const ids = (await cmd('ZRANGEBYSCORE', 'orders', now - 4 * WEEK, now)) || [];
  const weeks = [0, 0, 0, 0], sumMnt = [0, 0, 0, 0], byStatus = {}, products = {};
  for (const id of ids) {
    const o = JSON.parse((await cmd('GET', 'order:' + id)) || 'null');
    if (!o) continue;
    const w = Math.min(3, Math.floor((now - o.createdAt) / WEEK));
    weeks[w]++; sumMnt[w] += Number(o.totalMnt) || 0;
    byStatus[o.status] = (byStatus[o.status] || 0) + 1;
    // Захиалгын холбоосын дэлгүүрийг тоолно (coupang.com, smartstore.naver.com …) — хувийн мэдээлэлгүй
    let shop = 'холбоосгүй';
    try { if (o.link) shop = new URL(o.link).hostname.replace(/^www\.|^m\./, ''); } catch (e) {}
    products[shop] = (products[shop] || 0) + 1;
  }
  return {
    note: 'weeks[0] = сүүлийн 7 хоног, weeks[1] = өмнөх 7 хоног …',
    weeks, totalMnt: sumMnt, byStatus,
    byShop: Object.entries(products).sort((a, b) => b[1] - a[1]).slice(0, 15),
  };
}

// 3) Каталог: үнэ/зураггүй, хуучирсан бараа
async function catalog() {
  const CATALOG = await loadCatalog();
  const missing = [], stale = [];
  for (const [name] of CATALOG) {
    const r = await fetch(FS + encodeURIComponent(name) + '?key=' + process.env.FIREBASE_API_KEY);
    if (!r.ok) { missing.push(name); continue; }
    const f = (await r.json()).fields || {};
    if (!f.image?.stringValue || !Number(f.mnt?.integerValue)) missing.push(name);
    else if (now - Number(f.updated?.integerValue || 0) > 3 * 86400000) stale.push(name);
  }
  return { total: CATALOG.length, missingPriceOrImage: missing, staleOver3Days: stale };
}

for (const [k, fn] of [['facebook', facebook], ['orders', orders], ['catalog', catalog]]) {
  try { out[k] = await fn(); } catch (e) { out.errors.push(k + ': ' + e.message); }
}
fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'reports/stats.json'), JSON.stringify(out, null, 2));
console.log('reports/stats.json бичигдлээ', out.errors.length ? out.errors : '');
