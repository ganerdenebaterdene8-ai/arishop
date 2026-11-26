// Сайтын захиалга, сэтгэгдэл — хаалттай Upstash Redis дээр (Firestore-д БИШ).
// Хэрэглэгч зөвхөн өөрийн захиалгыг (захиалгын дугаар + нууц token) харна.
// Ажилтан/админ: x-admin-key толгой = ADMIN_KEY (админ) эсвэл STAFF_KEY (ажилтан).
//
// GET  /api/site-orders?reviews=1                          → баталгаажсан сэтгэгдлүүд (нийтэд)
// POST { action: 'create', order }                         → { id, token, order }
// POST { action: 'mine', refs: [{ id, token } | { id, phone }] } → өөрийн захиалгууд
// POST { action: 'lookup', id, phone }                     → захиалгын явц (хаяггүй)
// POST { action: 'received', id, token }                   → 5 → 6
// POST { action: 'review', id, token, stars, text }        → сэтгэгдэл (шалгалт хүлээнэ)
// --- ажилтан ---
// POST { action: 'whoami' } | 'list' | 'advance' {id,cargoNo} | 'reviews-pending' | 'review-set' {id,approved}
// --- зөвхөн админ ---
// POST { action: 'migrate' }  → хуучин Firestore `orders`-ийг нэг удаа Redis рүү хуулна
import crypto from 'crypto';
import { cmd, dbReady } from './_db.js';

const PROJECT = process.env.FIREBASE_PROJECT || 'arishop-2671a';
const LABELS = { 1: 'Захиалга баталгаажсан', 2: 'Дэлгүүрээс захиалсан', 3: 'Каргод өгсөн', 4: 'Монголд ирсэн', 5: 'Хэрэглэгчид хүргэсэн', 6: 'Хүлээж авсан ✓' };

const str = (v, n = 300) => String(v == null ? '' : v).slice(0, n);
const digits = (v) => String(v || '').replace(/[^0-9]/g, '');
const eqSafe = (a, b) => {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
};
function role(req) {
  const k = req.headers['x-admin-key'];
  if (process.env.ADMIN_KEY && eqSafe(k, process.env.ADMIN_KEY)) return 'admin';
  if (process.env.STAFF_KEY && eqSafe(k, process.env.STAFF_KEY)) return 'staff';
  return null;
}
const stamp = () => new Date().toLocaleString('mn-MN', { timeZone: 'Asia/Ulaanbaatar', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

const getO = async (id) => { const s = await cmd('GET', 'sorder:' + str(id, 40).toUpperCase()); return s ? JSON.parse(s) : null; };
const putO = async (o) => { await cmd('SET', 'sorder:' + o.id, JSON.stringify(o)); await cmd('ZADD', 'sorders', o.created || Date.now(), o.id); };
async function listO(limit = 300) {
  const ids = (await cmd('ZREVRANGE', 'sorders', 0, limit - 1)) || [];
  if (!ids.length) return [];
  const vals = await cmd('MGET', ...ids.map((i) => 'sorder:' + i));
  return (vals || []).filter(Boolean).map((s) => JSON.parse(s));
}
// Хэрэглэгчид буцаах хувилбар — token, ажилтны нэрийг нуух
const pub = (o) => { const { token, by, ...rest } = o; return rest; };
const owns = (o, ref) => !!o && (ref.token ? eqSafe(o.token, ref.token) : (o.legacy && ref.phone && digits(o.phone) === digits(ref.phone)));

function cleanOrder(x) {
  const items = (Array.isArray(x.items) ? x.items : []).slice(0, 50).map((it) => ({
    name: str(it.name, 200), price: str(it.price, 40), qty: Math.max(1, Math.min(999, Number(it.qty) || 1)), coupang: str(it.coupang, 500),
  }));
  return {
    name: str(x.name, 200), price: str(x.price, 40), items,
    address: str(x.address, 400), phone: digits(x.phone).slice(0, 12), cargo: str(x.cargo, 60),
    customer: str(x.customer, 80) || 'Зочин',
    referrer: digits(x.referrer).slice(0, 12),
    consolidateWith: (Array.isArray(x.consolidateWith) ? x.consolidateWith : []).slice(0, 20).map((i) => str(i, 20)),
  };
}

// ---- Firestore REST утгыг энгийн JSON болгох (migrate-д)
function fsVal(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fsVal);
  if ('mapValue' in v) { const o = {}; for (const [k, x] of Object.entries(v.mapValue.fields || {})) o[k] = fsVal(x); return o; }
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!dbReady()) return res.status(503).json({ error: 'Өгөгдлийн сан (Upstash Redis) тохируулаагүй' });

  try {
    if (req.method === 'GET') {
      if (req.query && req.query.reviews) {
        const ids = (await cmd('ZREVRANGE', 'reviews:ok', 0, 29)) || [];
        const vals = ids.length ? await cmd('MGET', ...ids.map((i) => 'review:' + i)) : [];
        const list = (vals || []).filter(Boolean).map((s) => JSON.parse(s)).map((r) => ({ who: r.who, stars: r.stars, text: r.text, created: r.created, approved: true }));
        res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
        return res.json(list);
      }
      return res.status(400).json({ error: 'bad request' });
    }
    if (req.method !== 'POST') return res.status(405).end();

    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const a = b.action;

    // ================= Хэрэглэгч =================
    if (a === 'create') {
      const o = cleanOrder(b.order || {});
      if (!o.items.length || o.phone.length < 8) return res.status(400).json({ error: 'Бараа эсвэл утас дутуу' });
      let id;
      for (let i = 0; i < 5; i++) {
        const cand = 'ARI-' + crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
        if ((await cmd('SET', 'sorder-id:' + cand, 1, 'NX')) === 'OK') { id = cand; break; }
      }
      if (!id) return res.status(500).json({ error: 'id' });
      const order = { ...o, id, token: crypto.randomBytes(16).toString('hex'), status: 1, dates: { 1: stamp() }, created: Date.now(), cargoNo: '' };
      await putO(order);
      return res.json({ id, token: order.token, order: pub(order) });
    }

    if (a === 'mine') {
      const refs = (Array.isArray(b.refs) ? b.refs : []).slice(0, 50);
      const out = [];
      for (const r of refs) { const o = await getO(r && r.id); if (owns(o, r || {})) out.push(pub(o)); }
      return res.json(out.sort((x, y) => (y.created || 0) - (x.created || 0)));
    }

    if (a === 'lookup') {
      const o = await getO(b.id);
      if (!o || digits(o.phone) !== digits(b.phone) || digits(b.phone).length < 8) return res.status(404).json({ error: 'Олдсонгүй' });
      const { address, ...safe } = pub(o);
      return res.json({ ...safe, legacyRef: o.legacy ? true : undefined });
    }

    if (a === 'received') {
      const o = await getO(b.id);
      if (!owns(o, b) || o.status !== 5) return res.status(403).json({ error: 'forbidden' });
      o.status = 6; o.dates = { ...(o.dates || {}), 6: stamp() };
      await putO(o);
      return res.json(pub(o));
    }

    if (a === 'review') {
      const o = await getO(b.id);
      if (!owns(o, b) || o.status !== 6) return res.status(403).json({ error: 'forbidden' });
      const stars = Math.round(Number(b.stars));
      const text = str(b.text, 500).trim();
      if (!(stars >= 1 && stars <= 5) || text.length < 3) return res.status(400).json({ error: 'Од, тайлбар дутуу' });
      const r = { id: o.id, who: str(o.customer, 80).trim().split(/\s+/)[0] || 'Захиалагч', stars, text, created: Date.now() };
      await cmd('SET', 'review:' + o.id, JSON.stringify(r));
      await cmd('ZADD', 'reviews:pending', r.created, o.id);
      return res.json({ ok: true });
    }

    // ================= Ажилтан / админ =================
    const who = role(req);
    if (!who) return res.status(401).json({ error: 'Нууц үг буруу' });

    if (a === 'whoami') return res.json({ role: who });
    if (a === 'list') return res.json(await listO());

    if (a === 'advance') {
      const o = await getO(b.id);
      if (!o || o.status >= 5) return res.status(400).json({ error: 'Төлөв шилжүүлэх боломжгүй' });
      if (o.status === 2) { const no = str(b.cargoNo, 40).trim(); if (!no) return res.status(400).json({ error: 'Карго дугаар оруулна уу' }); o.cargoNo = no; }
      const next = o.status + 1;
      o.status = next;
      o.dates = { ...(o.dates || {}), [next]: stamp() };
      o.by = { ...(o.by || {}), [next]: who === 'admin' ? 'Админ' : 'Ажилтан' };
      await putO(o);
      return res.json(o);
    }

    if (a === 'reviews-pending') {
      const ids = (await cmd('ZREVRANGE', 'reviews:pending', 0, 49)) || [];
      const vals = ids.length ? await cmd('MGET', ...ids.map((i) => 'review:' + i)) : [];
      return res.json((vals || []).filter(Boolean).map((s) => JSON.parse(s)));
    }
    if (a === 'review-set') {
      const id = str(b.id, 40);
      const s = await cmd('GET', 'review:' + id);
      if (!s) return res.status(404).json({ error: 'Олдсонгүй' });
      const r = JSON.parse(s);
      await cmd('ZREM', 'reviews:pending', id);
      if (b.approved) await cmd('ZADD', 'reviews:ok', r.created, id);
      else { await cmd('ZREM', 'reviews:ok', id); await cmd('DEL', 'review:' + id); }
      return res.json({ ok: true });
    }

    if (a === 'migrate') {
      if (who !== 'admin') return res.status(403).json({ error: 'Зөвхөн админ' });
      if (!process.env.FIREBASE_API_KEY) return res.status(500).json({ error: 'FIREBASE_API_KEY тохируулаагүй' });
      let pageToken = '', moved = 0, skipped = 0;
      do {
        const url = 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents/orders?pageSize=300&key=' + process.env.FIREBASE_API_KEY + (pageToken ? '&pageToken=' + pageToken : '');
        const r = await fetch(url);
        if (!r.ok) return res.status(502).json({ error: 'Firestore ' + r.status + ' — дүрмийг (rules) түгжихээс ӨМНӨ шилжүүлнэ үү', moved });
        const d = await r.json();
        for (const doc of d.documents || []) {
          const x = fsVal({ mapValue: { fields: doc.fields || {} } });
          const id = str(x.id || doc.name.split('/').pop(), 40).toUpperCase();
          if (await getO(id)) { skipped++; continue; }
          const o = { ...cleanOrder(x), id, status: Number(x.status) || 1, dates: x.dates || {}, by: x.by || {}, cargoNo: str(x.cargoNo, 40), created: Number(x.created) || Date.now(), legacy: true, token: '' };
          await cmd('SET', 'sorder-id:' + id, 1);
          await putO(o);
          moved++;
        }
        pageToken = d.nextPageToken || '';
      } while (pageToken);
      return res.json({ ok: true, moved, skipped });
    }

    return res.status(400).json({ error: 'unknown action' });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message || e) });
  }
}
