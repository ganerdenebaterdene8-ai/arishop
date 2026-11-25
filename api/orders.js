// Захиалга:
//   GET  /api/orders?id=ARI-1001           → нийтэд (зөвхөн явц, утас/хаяг харуулахгүй)
//   GET  /api/orders?all=1   + x-admin-key → бүх захиалга (админ)
//   PATCH /api/orders        + x-admin-key { id, status } → явц шинэчилж, Messenger-ээр мэдэгдэнэ
import { getOrder, saveOrder, listOrders, lastUserMsg, dbReady } from './_db.js';
import { sendText } from './_meta.js';
import { fmt } from './_pricing.js';

const SITE = process.env.SITE_URL || 'https://arishopkorea.vercel.app';
export const STATUSES = [
  'Захиалга авсан',
  'Төлбөр баталгаажсан',
  'Солонгост худалдаж авсан',
  'Монгол руу илгээсэн',
  'Улаанбаатарт ирсэн',
  'Хүлээлгэн өгсөн',
];

const isAdmin = (req) => !!process.env.ADMIN_KEY && req.headers['x-admin-key'] === process.env.ADMIN_KEY;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!dbReady()) return res.status(503).json({ error: 'Өгөгдлийн сан тохируулаагүй' });
  const q = req.query || {};

  if (req.method === 'GET') {
    if (q.all) {
      if (!isAdmin(req)) return res.status(401).json({ error: 'unauthorized' });
      return res.json(await listOrders());
    }
    const o = q.id ? await getOrder(q.id) : null;
    if (!o) return res.status(404).json({ error: 'Олдсонгүй' });
    return res.json({ id: o.id, status: o.status, totalMnt: o.totalMnt, history: o.history });
  }

  if (req.method === 'PATCH') {
    if (!isAdmin(req)) return res.status(401).json({ error: 'unauthorized' });
    const { id, status } = req.body || {};
    if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Буруу төлөв' });
    const o = await getOrder(id);
    if (!o) return res.status(404).json({ error: 'Олдсонгүй' });
    o.status = status;
    o.updatedAt = Date.now();
    o.history.push({ status, at: o.updatedAt });
    await saveOrder(o);

    // Meta-гийн дүрэм: хэрэглэгч сүүлийн 24 цагт бичсэн бол л Messenger-ээр илгээж болно
    let notified = false;
    if (o.psid && Date.now() - (await lastUserMsg(o.psid)) < 24 * 3600 * 1000) {
      try {
        await sendText(o.psid, `📦 ${o.id}: ${status}\nДүн: ${fmt(o.totalMnt)}\n${SITE}/track?id=${o.id}`);
        notified = true;
      } catch (e) {
        console.error(e);
      }
    }
    return res.json({ ok: true, notified });
  }

  res.status(405).end();
}
