// Каталогийн бараа бүрийг Coupang Partners-аас хайж зураг, үнэ, affiliate линкийг
// Firestore-ийн `prices`-д хадгална (sync-prices.js-тэй ижил document-ууд руу).
// Апп lp.image / lp.link-ийг аль хэдийн уншдаг тул зургууд автоматаар Coupang-ийнх болно.
// Гараар ажиллуулах: /api/sync-coupang?key=<SYNC_KEY>
import crypto from 'crypto';
import syncCatalog from './_catalog.js';

const PROJECT = 'arishop-2671a';
const FS = 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents/prices/';
const DOMAIN = 'https://api-gateway.coupang.com';
const PATH = '/v2/providers/affiliate_open_api/apis/openapi/products/search';
const MARGIN = Number(process.env.MARGIN || 0.15);
const SHIP_MNT = Number(process.env.SHIP_MNT || 0);
const RATE_FALLBACK = Number(process.env.KRW_MNT || 2.6);

function sign(method, path, query, secretKey, accessKey) {
  const dt = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z').slice(2);
  const message = dt + method + path + query;
  const signature = crypto.createHmac('sha256', secretKey).update(message).digest('hex');
  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${dt}, signature=${signature}`;
}

async function coupang(q) {
  const query = 'keyword=' + encodeURIComponent(q) + '&limit=10';
  const auth = sign('GET', PATH, query, process.env.COUPANG_SECRET_KEY, process.env.COUPANG_ACCESS_KEY);
  const r = await fetch(DOMAIN + PATH + '?' + query, { headers: { Authorization: auth } });
  if (!r.ok) throw new Error('coupang ' + r.status);
  const d = await r.json();
  return (((d.data || {}).productData) || []).map((i) => ({
    title: String(i.productName || ''),
    krw: Number(i.productPrice) || 0,
    image: i.productImage || '',
    link: i.productUrl || '',
  })).filter((i) => i.krw > 0 && i.image);
}

function pick(items, hint) {
  let list = items;
  if (hint) {
    const h = list.filter((i) => i.title.toLowerCase().includes(hint));
    if (h.length) list = h;
  }
  if (!list.length) return null;
  const sorted = list.slice().sort((a, b) => a.krw - b.krw);
  const med = sorted[Math.floor(sorted.length / 2)].krw;
  return sorted.filter((i) => i.krw >= med * 0.4)[0] || sorted[0];
}

async function krwToMnt() {
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/KRW');
    const d = await r.json();
    const v = d && d.rates && Number(d.rates.MNT);
    if (v && v > 0.5 && v < 20) return v;
  } catch (e) {}
  return RATE_FALLBACK;
}

async function save(name, doc) {
  // updateMask-тай PATCH: зөвхөн эдгээр талбарыг шинэчилнэ, Naver-ийн бусад талбар хэвээр
  const mask = ['image', 'link', 'mall', 'krw', 'mnt', 'rate', 'updated'].map((f) => 'updateMask.fieldPaths=' + f).join('&');
  const url = FS + encodeURIComponent(name) + '?key=' + process.env.FIREBASE_API_KEY + '&' + mask;
  const fields = {
    image: { stringValue: doc.image },
    link: { stringValue: doc.link },
    mall: { stringValue: 'Coupang' },
    krw: { integerValue: String(doc.krw) },
    mnt: { integerValue: String(doc.mnt) },
    rate: { doubleValue: doc.rate },
    updated: { integerValue: String(Date.now()) },
  };
  const r = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
  if (!r.ok) throw new Error('firestore ' + r.status + ' ' + (await r.text()).slice(0, 200));
}

export default async function handler(req, res) {
  const { requireJobAuth } = await import('./_job-auth.js');
  const auth = requireJobAuth(req);
  if (!auth.ok) return res.status(401).json({ error: 'unauthorized' });
  if (!process.env.COUPANG_ACCESS_KEY || !process.env.COUPANG_SECRET_KEY || !process.env.FIREBASE_API_KEY) {
    return res.status(500).json({ error: 'COUPANG_ACCESS_KEY / COUPANG_SECRET_KEY / FIREBASE_API_KEY тохируулаагүй' });
  }
  const rate = await krwToMnt();
  const done = [], failed = [];
  for (const [name, query, hint] of syncCatalog) {
    try {
      const best = pick(await coupang(query), hint);
      if (!best) { failed.push([name, 'no items']); continue; }
      const mnt = Math.round((best.krw * rate * (1 + MARGIN) + SHIP_MNT) / 1000) * 1000;
      await save(name, { image: best.image, link: best.link, krw: best.krw, mnt, rate });
      done.push({ name, krw: best.krw, mnt });
      await new Promise((r2) => setTimeout(r2, 150)); // API rate limit хамгаалалт
    } catch (e) {
      failed.push([name, String(e)]);
    }
  }
  res.json({ source: 'coupang', rate, margin: MARGIN, updated: done.length, failed: failed.length, failedList: failed, done });
}
