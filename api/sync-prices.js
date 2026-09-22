// Дроны барааны үнийг Naver Shopping-аас татаж, ₮ болгож Firestore-ийн `prices`-д хадгална.
// Vercel Cron өдөрт 2 удаа дуудна (vercel.json). Гараар: /api/sync-prices?key=<SYNC_KEY>
const PROJECT = 'arishop-2671a';
const FS = 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents/prices/';

// [сайт дээрх барааны нэр, Naver хайлтын үг, санамсаргүй хямд/хуурамч зарыг шүүх түлхүүр]
import CATALOG from './_catalog.js';

const MARGIN = Number(process.env.MARGIN || 0.15);      // таны маржин
const SHIP_MNT = Number(process.env.SHIP_MNT || 0);     // барааны тээврийн нэмэлт (хүсвэл)
const RATE_FALLBACK = Number(process.env.KRW_MNT || 2.6);

async function krwToMnt() {
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/KRW');
    const d = await r.json();
    const v = d && d.rates && Number(d.rates.MNT);
    if (v && v > 0.5 && v < 20) return v;
  } catch (e) {}
  return RATE_FALLBACK;
}

async function naver(q) {
  const r = await fetch('https://openapi.naver.com/v1/search/shop.json?display=10&sort=asc&query=' + encodeURIComponent(q), {
    headers: { 'X-Naver-Client-Id': process.env.NAVER_ID, 'X-Naver-Client-Secret': process.env.NAVER_SECRET },
  });
  if (!r.ok) throw new Error('naver ' + r.status);
  const d = await r.json();
  return (d.items || []).map((i) => ({
    title: String(i.title || '').replace(/<[^>]+>/g, ''),
    krw: Number(i.lprice) || 0,
    image: i.image || '',
    link: i.link || '',
    brand: String(i.brand || i.maker || '').toLowerCase(),
    mall: i.mallName || '',
  })).filter((i) => i.krw > 0);
}

// хэт хямд (хэрэгсэл/хуурамч) зарыг шүүх: медианы 40%-иас доошийг хаяна
function pick(items, hint) {
  let list = items;
  if (hint) {
    const h = list.filter((i) => (i.brand + ' ' + i.title).toLowerCase().includes(hint));
    if (h.length) list = h;
  }
  if (!list.length) return null;
  const sorted = list.slice().sort((a, b) => a.krw - b.krw);
  const med = sorted[Math.floor(sorted.length / 2)].krw;
  const ok = sorted.filter((i) => i.krw >= med * 0.4);
  return ok[0] || sorted[0];
}

async function save(name, doc) {
  const url = FS + encodeURIComponent(name) + '?key=' + process.env.FIREBASE_API_KEY;
  const fields = {
    name: { stringValue: name },
    query: { stringValue: doc.query },
    krw: { integerValue: String(doc.krw) },
    mnt: { integerValue: String(doc.mnt) },
    rate: { doubleValue: doc.rate },
    image: { stringValue: doc.image || '' },
    link: { stringValue: doc.link || '' },
    mall: { stringValue: doc.mall || '' },
    updated: { integerValue: String(Date.now()) },
  };
  const r = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
  if (!r.ok) throw new Error('firestore ' + r.status + ' ' + (await r.text()).slice(0, 200));
}

export default async function handler(req, res) {
  const { requireJobAuth } = await import('./_job-auth.js');
  const auth = requireJobAuth(req);
  if (!auth.ok) return res.status(401).json({ error: 'unauthorized' });
  if (!process.env.NAVER_ID || !process.env.NAVER_SECRET || !process.env.FIREBASE_API_KEY) {
    return res.status(500).json({ error: 'NAVER_ID / NAVER_SECRET / FIREBASE_API_KEY тохируулаагүй' });
  }
  const rate = await krwToMnt();
  const done = [], failed = [];
  for (const [name, query, hint] of CATALOG) {
    try {
      const best = pick(await naver(query), hint);
      if (!best) { failed.push([name, 'no items']); continue; }
      const mnt = Math.round((best.krw * rate * (1 + MARGIN) + SHIP_MNT) / 1000) * 1000;
      await save(name, { query, krw: best.krw, mnt, rate, image: best.image, link: best.link, mall: best.mall });
      done.push({ name, krw: best.krw, mnt });
    } catch (e) {
      failed.push([name, String(e)]);
    }
  }
  res.json({ rate, margin: MARGIN, updated: done.length, failed, done });
}
