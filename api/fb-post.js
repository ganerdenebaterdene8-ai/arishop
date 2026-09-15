// Өдөр бүр Facebook пэйж дээр "Өдрийн бараа" пост автоматаар тавина.
// Vercel Cron: өдөр бүр 03:00 UTC (11:00 Улаанбаатар). Гараар: /api/fb-post?key=<SYNC_KEY>
// Орчны хувьсагч:
//   FB_PAGE_ID      — пэйжийн ID (Page → About → Page ID)
//   FB_PAGE_TOKEN   — Page Access Token (доорх зааврын дагуу авна)
//   FIREBASE_API_KEY — аль хэдийн байгаа
import CATALOG from './_catalog.js';

const PROJECT = 'arishop-2671a';
const FS = 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents/prices/';
const SITE = 'https://arishopkorea.vercel.app';

const HOOKS = [
  'Өнөөдрийн онцлох бараа 🇰🇷',
  'Солонгосоос шууд захиалаарай!',
  'Өдрийн шилдэг сонголт ✨',
  'Энэ барааг олон хүн захиалж байна 🔥',
  'Аришопын өнөөдрийн санал',
];

function fmt(n) { return Number(n).toLocaleString('mn-MN'); }

async function getPrice(name) {
  const url = FS + encodeURIComponent(name) + '?key=' + process.env.FIREBASE_API_KEY;
  const r = await fetch(url);
  if (!r.ok) return null;
  const d = await r.json();
  const f = d.fields || {};
  const val = (x) => x ? (x.stringValue ?? Number(x.integerValue ?? x.doubleValue)) : undefined;
  return { image: val(f.image), mnt: val(f.mnt), krw: val(f.krw) };
}

export default async function handler(req, res) {
  const key = (req.query && req.query.key) || '';
  const isCron = !!(req.headers && req.headers['x-vercel-cron']);
  if (!isCron && process.env.SYNC_KEY && key !== process.env.SYNC_KEY) return res.status(401).json({ error: 'unauthorized' });
  const PAGE = process.env.FB_PAGE_ID, TOKEN = process.env.FB_PAGE_TOKEN;
  if (!PAGE || !TOKEN) return res.status(500).json({ error: 'FB_PAGE_ID / FB_PAGE_TOKEN тохируулаагүй' });

  // Өдөр бүр дараагийн бараа: жилийн хэддэх өдрөөр каталогийг тойрно (давхардахгүй)
  const day = Math.floor(Date.now() / 86400000);
  for (let attempt = 0; attempt < CATALOG.length; attempt++) {
    const item = CATALOG[(day + attempt) % CATALOG.length];
    const name = item[0];
    const p = await getPrice(name);
    if (!p || !p.image || !p.mnt) continue; // зураг/үнэгүй бол дараагийнхыг үзнэ
    const hook = HOOKS[day % HOOKS.length];
    const caption =
      hook + '\n\n' +
      '📦 ' + name + '\n' +
      '💰 Үнэ: ' + fmt(p.mnt) + '₮\n\n' +
      'Захиалга өгөх: ' + SITE + '\n' +
      'Солонгосын албан ёсны сайтаас — жинхэнэ бараа, найдвартай хүргэлт.\n\n' +
      '#Arishop #Солонгос #Захиалга #' + name.split(' ')[0].replace(/[^\wа-яА-ЯөүёӨҮЁ]/g, '');
    // Зурагтай пост: /photos endpoint (url + caption)
    const r = await fetch('https://graph.facebook.com/v21.0/' + PAGE + '/photos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: p.image, caption, access_token: TOKEN }),
    });
    const d = await r.json();
    if (!r.ok) return res.status(500).json({ error: 'facebook', detail: d });
    return res.json({ posted: name, mnt: p.mnt, post_id: d.post_id || d.id });
  }
  res.status(404).json({ error: 'зураг/үнэтэй бараа олдсонгүй — эхлээд sync ажиллуулна уу' });
}
