// DM-ийн үнийн тооцоо — сайтын sync-prices.js-тэй ЯГ ижил томьёо:
//   ₮ = round((вон × ханш × (1 + MARGIN) + SHIP_MNT) / 1000) × 1000
// Нэмэлтээр CARGO_PER_KG тохируулбал жингээр карго нэмнэ (тохируулаагүй бол тусад нь тооцно гэж хэлнэ).
const MARGIN = Number(process.env.MARGIN || 0.15);
const SHIP_MNT = Number(process.env.SHIP_MNT || 0);
const RATE_FALLBACK = Number(process.env.KRW_MNT || 2.6);
const CARGO_PER_KG = Number(process.env.CARGO_PER_KG || 0);

let cache = { rate: 0, at: 0 };
export async function krwToMnt() {
  if (cache.rate && Date.now() - cache.at < 6 * 3600 * 1000) return cache.rate;
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/KRW');
    const d = await r.json();
    const v = d && d.rates && Number(d.rates.MNT);
    if (v && v > 0.5 && v < 20) { cache = { rate: v, at: Date.now() }; return v; }
  } catch (e) {}
  return RATE_FALLBACK;
}

export async function calcQuote(krw, weightKg) {
  const rate = await krwToMnt();
  const itemMnt = Math.round((krw * rate * (1 + MARGIN) + SHIP_MNT) / 1000) * 1000;
  const cargoMnt = CARGO_PER_KG && weightKg ? Math.round((weightKg * CARGO_PER_KG) / 100) * 100 : 0;
  return { krw, weightKg: weightKg || null, rate, itemMnt, cargoMnt, totalMnt: itemMnt + cargoMnt };
}

// Мессежээс вонны үнэ олох: "35000", "35,000вон", "₩35 000", "35000 won"
export function parseKrw(text) {
  const t = String(text).replace(/https?:\/\/\S+/g, ' ');
  const m =
    t.match(/₩\s*(\d[\d,\s]{2,})/) ||
    t.match(/(\d[\d,\s]{2,})\s*(вон|won|원|krw)/i) ||
    t.match(/(?:^|\s)(\d{4,7})(?:\s|$)/);
  if (!m) return null;
  const n = Number(m[1].replace(/[,\s]/g, ''));
  return n >= 500 && n <= 20000000 ? n : null;
}

export function parseWeight(text) {
  const m = String(text).match(/(\d+(?:[.,]\d+)?)\s*(кг|kg)/i);
  return m ? Number(m[1].replace(',', '.')) : null;
}

export const fmt = (n) => Number(n).toLocaleString('en-US') + '₮';

export function quoteText(q, deliveryDays) {
  const lines = [`💰 Үнийн тооцоо (${q.krw.toLocaleString('en-US')}₩):`, `• Бараа: ${fmt(q.itemMnt)}`];
  if (q.cargoMnt) lines.push(`• Карго (~${q.weightKg}кг): ${fmt(q.cargoMnt)}`, `👉 Нийт: ${fmt(q.totalMnt)}`);
  else lines.push('• Карго: жингээс хамаарч тусад нь тооцно');
  lines.push(`🚚 Хүргэлт ${deliveryDays} хоног.`, '', 'Захиалах бол "захиалах" гэж бичээрэй.');
  return lines.join('\n');
}
