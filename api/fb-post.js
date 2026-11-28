// Өдөр бүр Facebook пэйж дээр "Өдрийн бараа" пост автоматаар тавина.
// Vercel Cron: өдөр бүр 03:00 UTC (11:00 Улаанбаатар). Гараар: /api/fb-post?key=<SYNC_KEY>
// Орчны хувьсагч:
//   FB_PAGE_ID      — пэйжийн ID (Page → About → Page ID)
//   FB_PAGE_TOKEN   — Page Access Token (доорх зааврын дагуу авна)
//   FIREBASE_API_KEY — аль хэдийн байгаа
import CATALOG from './_catalog.js';
import QUEUE from './_queue.js';
import { allowed } from './_auth.js';

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

// Үнэ хэдэн хоногоос хуучин бол постонд тоо бичихгүй (Naver Shopping API 2026-07-31-нд хаагдсанаас хойш
// үнэ шинэчлэгдэхгүй байж болзошгүй — хуучин ханш/үнийг олон нийтэд зарлахгүй)
const STALE_DAYS = Number(process.env.PRICE_STALE_DAYS || 3);
const isFresh = (p) => !!(p && p.updated && Date.now() - p.updated < STALE_DAYS * 86400000);
const priceText = (p) => (isFresh(p) ? fmt(p.mnt) + '₮' : 'үнийг DM-ээр асуугаарай');

async function getPrice(name) {
  const url = FS + encodeURIComponent(name) + '?key=' + process.env.FIREBASE_API_KEY;
  const r = await fetch(url);
  if (!r.ok) return null;
  const d = await r.json();
  const f = d.fields || {};
  const val = (x) => x ? (x.stringValue ?? Number(x.integerValue ?? x.doubleValue)) : undefined;
  return { image: val(f.image), mnt: val(f.mnt), krw: val(f.krw), updated: Number(val(f.updated)) || 0 };
}

export default async function handler(req, res) {
  if (!allowed(req)) return res.status(401).json({ error: 'unauthorized' });
  const PAGE = process.env.FB_PAGE_ID, TOKEN = process.env.FB_PAGE_TOKEN;
  if (!PAGE || !TOKEN) return res.status(500).json({ error: 'FB_PAGE_ID / FB_PAGE_TOKEN тохируулаагүй' });

  // 1) Бот бэлдсэн өнөөдрийн пост (api/_queue.js) байвал түүнийг тавина
  const ubDate = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const q = QUEUE[ubDate];
  if (q && q.product && q.caption) {
    const p = await getPrice(q.product);
    if (p && p.image && p.mnt) {
      const caption = q.caption.replace(/\{price\}/g, priceText(p)).replace(/\{site\}/g, SITE);
      const r = await fetch('https://graph.facebook.com/v21.0/' + PAGE + '/photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: p.image, caption, access_token: TOKEN }),
      });
      const d = await r.json();
      if (!r.ok) return res.status(500).json({ error: 'facebook', detail: d });
      return res.json({ posted: q.product, mnt: p.mnt, priceShown: isFresh(p), source: 'queue', post_id: d.post_id || d.id });
    }
  }

  // 2) Үгүй бол: жилийн хэддэх өдрөөр каталогийг тойрно (давхардахгүй)
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
      '💰 Үнэ: ' + priceText(p) + '\n\n' +
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
    return res.json({ posted: name, mnt: p.mnt, priceShown: isFresh(p), post_id: d.post_id || d.id });
  }
  res.status(404).json({ error: 'зураг/үнэтэй бараа олдсонгүй — эхлээд sync ажиллуулна уу' });
}
