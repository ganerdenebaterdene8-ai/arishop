// Coupang Partners Open API прокси — барааны хайлт (зураг, үнэ, affiliate линк).
// GET /api/coupang?q=DJI%20Mini%204%20Pro
// Орчны хувьсагч: COUPANG_ACCESS_KEY, COUPANG_SECRET_KEY (partners.coupang.com → API Keys)
import crypto from 'crypto';

const DOMAIN = 'https://api-gateway.coupang.com';
const PATH = '/v2/providers/affiliate_open_api/apis/openapi/products/search';

function sign(method, path, query, secretKey, accessKey) {
  // Coupang CEA HMAC: datetime нь yyMMdd'T'HHmmss'Z' (GMT)
  const dt = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z').slice(2); // 260825T123456Z
  const message = dt + method + path + query;
  const signature = crypto.createHmac('sha256', secretKey).update(message).digest('hex');
  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${dt}, signature=${signature}`;
}

export default async function handler(req, res) {
  const q = String((req.query && req.query.q) || '').trim();
  const limit = Math.min(Number((req.query && req.query.limit) || 10), 20);
  if (!q) return res.status(400).json({ error: 'q required' });
  const AK = process.env.COUPANG_ACCESS_KEY, SK = process.env.COUPANG_SECRET_KEY;
  if (!AK || !SK) return res.status(500).json({ error: 'COUPANG_ACCESS_KEY / COUPANG_SECRET_KEY тохируулаагүй' });
  try {
    const query = 'keyword=' + encodeURIComponent(q) + '&limit=' + limit;
    const auth = sign('GET', PATH, query, SK, AK);
    const r = await fetch(DOMAIN + PATH + '?' + query, { headers: { Authorization: auth, 'Content-Type': 'application/json' } });
    if (!r.ok) return res.status(r.status).json({ error: 'coupang ' + r.status, detail: (await r.text()).slice(0, 300) });
    const d = await r.json();
    const items = (((d.data || {}).productData) || []).map((i) => ({
      title: i.productName || '',
      krw: Number(i.productPrice) || 0,
      image: i.productImage || '',
      link: i.productUrl || '', // affiliate линк — комисс энэ линкээр орж ирнэ
      rocket: !!i.isRocket,
      rank: i.rank,
    })).filter((i) => i.krw > 0);
    res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400');
    res.json({ query: q, count: items.length, items });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
