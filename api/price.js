export default async function handler(req, res) {
  const q = String((req.query && req.query.q) || '').trim();
  if (!q) return res.status(400).json({ error: 'q required' });
  if (!process.env.NAVER_ID || !process.env.NAVER_SECRET) {
    return res.status(500).json({ error: 'NAVER_ID / NAVER_SECRET тохируулаагүй' });
  }
  try {
    const url = 'https://openapi.naver.com/v1/search/shop.json?display=10&sort=asc&query=' + encodeURIComponent(q);
    const r = await fetch(url, {
      headers: {
        'X-Naver-Client-Id': process.env.NAVER_ID,
        'X-Naver-Client-Secret': process.env.NAVER_SECRET,
      },
    });
    if (!r.ok) return res.status(r.status).json({ error: 'naver ' + r.status, detail: await r.text() });
    const d = await r.json();
    const items = (d.items || []).map((i) => ({
      title: String(i.title || '').replace(/<[^>]+>/g, ''),
      krw: Number(i.lprice) || 0,
      image: i.image || '',
      link: i.link || '',
      brand: i.brand || i.maker || '',
      mall: i.mallName || '',
    })).filter((i) => i.krw > 0);
    res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400');
    res.json({ query: q, count: items.length, items });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
