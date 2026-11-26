// Сайтын үнийн тооцоолуур: GET /api/quote?krw=35000&kg=1.2
// DM бот болон каталогийн үнэтэй ЯГ ижил томьёо (_pricing.js) ашиглана.
import { calcQuote } from './_pricing.js';

export default async function handler(req, res) {
  const q = req.query || {};
  const krw = Number(String(q.krw || '').replace(/[^0-9]/g, ''));
  const kg = Number(String(q.kg || '').replace(',', '.'));
  if (!krw || krw < 500 || krw > 20000000) return res.status(400).json({ error: 'krw 500–20,000,000 хооронд байх ёстой' });
  try {
    const quote = await calcQuote(krw, kg > 0 && kg < 200 ? kg : null);
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
    res.json(quote);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
