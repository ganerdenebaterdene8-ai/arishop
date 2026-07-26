const PROJECT = 'arishop-2671a';
const FS = 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents/prices/';

const CATALOG = [
  ['DJI Mini 4K дрон', 'DJI Mini 4K 드론', 'dji', 300000],
  ['DJI Mini 4 Pro', 'DJI Mini 4 Pro 드론', 'dji', 500000],
  ['DJI Neo селфи дрон', 'DJI Neo 드론', 'dji', 200000],
  ['DJI Flip дрон', 'DJI Flip 드론', 'dji', 400000],
  ['DJI Avata 2 FPV дрон', 'DJI Avata 2 드론', 'dji', 500000],
  ['DJI Air 3S дрон', 'DJI Air 3S 드론', 'dji', 900000],
  ['DJI Mavic 3 Classic', 'DJI Mavic 3 Classic 드론', 'dji', 1200000],
  ['Potensic ATOM 2 дрон', 'Potensic ATOM 2 드론', 'potensic', 100000],
  ['HoverAir X1 дрон', 'HoverAir X1 드론', 'hover', 300000],
  ['Хүүхдийн mini дрон LED', '미니드론 LED 어린이', '', 10000],
  ['DJI Goggles N3 нүдний шил', 'DJI Goggles N3', 'dji', 200000],
  ['DJI RC 2 удирдлага', 'DJI RC 2 조종기', 'dji', 200000],
  ['Дроны нэмэлт батарей', 'DJI 인텔리전트 배터리', 'dji', 50000],
  ['Дрон цэнэглэх hub', 'DJI 충전 허브', 'dji', 20000],
  ['Дроны сэнс 4 хос', 'DJI 프로펠러', 'dji', 5000],
  ['Дроны сэнсний хамгаалах тор', 'DJI 프로펠러 가드', '', 5000],
  ['ND шүүлтүүрийн багц', 'DJI ND 필터 세트', '', 20000],
  ['Зөөврийн дроны цүнх', '드론 가방 케이스', '', 15000],
];

const MARGIN = Number(process.env.MARGIN || 0.15);
const SHIP_MNT = Number(process.env.SHIP_MNT || 0);
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
  const r = await fetch('https://openapi.naver.com/v1/search/shop.json?display=10&sort=sim&query=' + encodeURIComponent(q), {
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

function pick(items, hint, min) {
  let list = items.filter((i) => i.krw >= (min || 0));
  if (hint) {
    const h = list.filter((i) => (i.brand + ' ' + i.title).toLowerCase().includes(hint));
    if (h.length) list = h;
  }
  if (!list.length) return null;
  const sorted = list.slice().sort((a, b) => a.krw - b.krw);
  return sorted[Math.floor(sorted.length / 2)];
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
  const key = (req.query && req.query.key) || '';
  const isCron = !!(req.headers && req.headers['x-vercel-cron']);
  if (!isCron && process.env.SYNC_KEY && key !== process.env.SYNC_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (!process.env.NAVER_ID || !process.env.NAVER_SECRET || !process.env.FIREBASE_API_KEY) {
    return res.status(500).json({ error: 'түлхүүр тохируулаагүй' });
  }
  const rate = 2.6;
  const done = [], failed = [];
    for (const [name, query, hint, min] of CATALOG) {
    try {
      const best = pick(await naver(query), hint, min);
      if (!best) { failed.push([name, 'no items']); continue; }
      const mnt = Math.round((best.krw * rate * (1 + MARGIN) + SHIP_MNT) / 1000) * 1000;
      await save(name, { query, krw: best.krw, mnt, rate, image: best.image, link: best.link, mall: best.mall });
      done.push({ name, krw: best.krw, mnt });
    } catch (e) {
      failed.push([name, String(e)]);
    }
  }
 res.json({ rate, margin: MARGIN, updated: done.length, failed, done });
    res.json({ rate, margin: MARGIN, updated: done.length, failed, done });
}
