// Өдөр бүр "Өдрийн бараа" богино видео (1080x1920, 15 сек) үүсгээд Facebook пэйж дээр тавина.
// GitHub Actions (.github/workflows/daily-video.yml) өдөр бүр ажиллуулна.
// Орчны хувьсагч (GitHub → Settings → Secrets → Actions):
//   FB_PAGE_ID, FB_PAGE_TOKEN, FIREBASE_API_KEY  — Vercel дээрхтэй ижил утга
//   DRY_RUN=1 бол зөвхөн видео үүсгэнэ, Facebook-т тавихгүй.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'out');
const PROJECT = 'arishop-2671a';
const FS = 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents/prices/';
const SITE = 'https://arishopkorea.vercel.app';
const DELIVERY = '7–14 хоногт хүргэнэ';
const FONT = process.env.FONT || '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
const DRY = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

const HOOKS = [
  'Өнөөдрийн онцлох бараа',
  'Солонгосоос шууд захиалаарай!',
  'Өдрийн шилдэг сонголт',
  'Энэ барааг олон хүн захиалж байна',
  'Аришопын өнөөдрийн санал',
];

// api/_catalog.js нь ESM — node-д .mjs болгож уншина
async function loadCatalog() {
  const tmp = path.join(os.tmpdir(), 'catalog-' + process.pid + '.mjs');
  fs.copyFileSync(path.join(ROOT, 'api/_catalog.js'), tmp);
  return (await import(tmp)).default;
}

const fmt = (n) => Number(n).toLocaleString('en-US');

async function getPrice(name) {
  const r = await fetch(FS + encodeURIComponent(name) + '?key=' + process.env.FIREBASE_API_KEY);
  if (!r.ok) return null;
  const f = (await r.json()).fields || {};
  const val = (x) => (x ? (x.stringValue ?? Number(x.integerValue ?? x.doubleValue)) : undefined);
  return { image: val(f.image), mnt: val(f.mnt) };
}

function wrap(text, max) {
  const words = text.split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3).join('\n');
}

export function render({ imagePath, name, mnt, hook, outFile }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vid-'));
  const t = (file, s) => { const p = path.join(dir, file); fs.writeFileSync(p, s); return p; };
  const files = {
    brand: t('brand.txt', 'АРИШОП  ·  Солонгосоос'),
    hook: t('hook.txt', wrap(hook, 22)),
    name: t('name.txt', wrap(name, 22)),
    price: t('price.txt', fmt(mnt) + '₮'),
    ship: t('ship.txt', DELIVERY),
    cta: t('cta.txt', 'arishopkorea.mn  ·  DM бичээрэй'),
  };
  const dt = (file, opts) => `drawtext=fontfile=${FONT}:textfile=${file}:${opts}`;
  const filter = [
    // арын дэвсгэр: зургийг дүүргээд бүдгэрүүлж, харанхуйлна
    `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=30:5,eq=brightness=-0.25[bg]`,
    // урд талын зураг: цагаан дөрвөлжин дээр, аажим томорно
    `[0:v]scale=860:860:force_original_aspect_ratio=decrease,pad=900:900:(ow-iw)/2:(oh-ih)/2:white,` +
      `zoompan=z='min(zoom+0.0007,1.10)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=450:s=900x900:fps=30[fg]`,
    `[bg][fg]overlay=(W-w)/2:430[v0]`,
    `[v0]` + [
      dt(files.brand, `fontsize=40:fontcolor=white@0.9:x=(w-text_w)/2:y=110`),
      dt(files.hook, `fontsize=68:fontcolor=white:line_spacing=12:x=(w-text_w)/2:y=200:borderw=4:bordercolor=black@0.6:alpha='min(t/0.6,1)'`),
      dt(files.name, `fontsize=64:fontcolor=white:line_spacing=10:x=(w-text_w)/2:y=1370:borderw=4:bordercolor=black@0.6:enable='gte(t,1.5)'`),
      dt(files.price, `fontsize=110:fontcolor=white:x=(w-text_w)/2:y=1560:box=1:boxcolor=0xc67139:boxborderw=28:enable='gte(t,4)'`),
      dt(files.ship, `fontsize=52:fontcolor=white:x=(w-text_w)/2:y=1730:enable='gte(t,7)'`),
      dt(files.cta, `fontsize=44:fontcolor=0xffd9bf:x=(w-text_w)/2:y=1810:enable='gte(t,9)'`),
    ].join(',') + `,format=yuv420p[v]`,
  ].join(';');
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-loop', '1', '-t', '15', '-i', imagePath,
    '-f', 'lavfi', '-t', '15', '-i', 'anullsrc=r=44100:cl=stereo',
    '-filter_complex', filter,
    '-map', '[v]', '-map', '1:a',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-r', '30',
    '-c:a', 'aac', '-shortest', '-movflags', '+faststart', outFile,
  ], { stdio: 'inherit' });
  return outFile;
}

async function postVideo(file, description) {
  const PAGE = process.env.FB_PAGE_ID, TOKEN = process.env.FB_PAGE_TOKEN;
  if (!PAGE || !TOKEN) throw new Error('FB_PAGE_ID / FB_PAGE_TOKEN тохируулаагүй');
  const form = new FormData();
  form.append('access_token', TOKEN);
  form.append('description', description);
  form.append('source', new Blob([fs.readFileSync(file)], { type: 'video/mp4' }), 'video.mp4');
  const r = await fetch('https://graph-video.facebook.com/v21.0/' + PAGE + '/videos', { method: 'POST', body: form });
  const d = await r.json();
  if (!r.ok) throw new Error('facebook: ' + JSON.stringify(d));
  return d.id;
}

async function main() {
  if (!process.env.FIREBASE_API_KEY) throw new Error('FIREBASE_API_KEY тохируулаагүй');
  const CATALOG = await loadCatalog();
  fs.mkdirSync(OUT, { recursive: true });
  const day = Math.floor(Date.now() / 86400000);
  for (let attempt = 0; attempt < CATALOG.length; attempt++) {
    const name = CATALOG[(day + attempt) % CATALOG.length][0];
    const p = await getPrice(name);
    if (!p || !p.image || !p.mnt) continue;
    const img = await fetch(p.image);
    if (!img.ok) continue;
    const imagePath = path.join(OUT, 'product');
    fs.writeFileSync(imagePath, Buffer.from(await img.arrayBuffer()));
    const hook = HOOKS[day % HOOKS.length];
    const video = render({ imagePath, name, mnt: p.mnt, hook, outFile: path.join(OUT, 'daily.mp4') });
    const caption =
      hook + ' 🇰🇷\n\n' +
      '📦 ' + name + '\n' +
      '💰 Үнэ: ' + fmt(p.mnt) + '₮\n' +
      '🚚 ' + DELIVERY + '\n' +
      '💳 QPay / Хаан банк\n\n' +
      'Захиалга өгөх: ' + SITE + '\n' +
      'Эсвэл DM бичээрэй 👇\n\n' +
      '#Arishop #АриШоп #Солонгос #СолонгосБараа #Захиалга';
    fs.writeFileSync(path.join(OUT, 'caption.txt'), caption);
    if (DRY) { console.log('DRY_RUN — видео үүссэн, тавиагүй:', name); return; }
    const id = await postVideo(video, caption);
    console.log('Тавьсан:', name, fmt(p.mnt) + '₮', 'video id', id);
    return;
  }
  throw new Error('зураг/үнэтэй бараа олдсонгүй — эхлээд /api/sync-prices ажиллуулна уу');
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main().catch((e) => { console.error(e.message || e); process.exit(1); });
}
