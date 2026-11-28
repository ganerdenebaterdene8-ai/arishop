// Барааны холбоосоос вон дээрх үнэ, нэрийг автоматаар олох (DM бот ашиглана).
// Олон Солонгос дэлгүүр гадаадаас хандахыг хаадаг (Coupang, Naver) тул олдохгүй бол null буцаана —
// тэр үед бот хэрэглэгчээс үнийг вон-оор бичихийг хүснэ (хуучин зан төлөв).

const MIN = 500, MAX = 20000000;
const ok = (n) => Number.isFinite(n) && n >= MIN && n <= MAX;
const num = (s) => Number(String(s).replace(/[,\s]/g, ''));

export function priceFromHtml(html) {
  // 1) JSON-LD (schema.org Product → offers.price)
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1].trim());
      const list = Array.isArray(data) ? data : data['@graph'] || [data];
      for (const d of list) {
        const offers = d && d.offers ? (Array.isArray(d.offers) ? d.offers : [d.offers]) : [];
        for (const o of offers) {
          const n = num(o.price ?? o.lowPrice ?? '');
          if (ok(n) && (!o.priceCurrency || /KRW/i.test(o.priceCurrency))) return n;
        }
      }
    } catch (e) {}
  }
  // 2) Meta tag-ууд (og / product)
  const meta = html.match(/<meta[^>]+(?:property|name)=["'](?:product:price:amount|og:price:amount|product:sale_price:amount)["'][^>]*content=["']([\d.,]+)["']/i)
    || html.match(/<meta[^>]+content=["']([\d.,]+)["'][^>]*(?:property|name)=["'](?:product:price:amount|og:price:amount)["']/i);
  if (meta && ok(num(meta[1]))) return num(meta[1]);
  // 3) Дэлгүүрүүдийн дотоод JSON (Musinsa, Olive Young, Gmarket …)
  const keys = /"(?:salePrice|finalPrice|sellPrice|discountPrice|normalPrice|price)"\s*:\s*"?([\d,]{3,11})"?/g;
  for (const m of html.matchAll(keys)) { const n = num(m[1]); if (ok(n)) return n; }
  return null;
}

export function titleFromHtml(html) {
  const m = html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']{2,200})["']/i) || html.match(/<title>([^<]{2,200})<\/title>/i);
  return m ? m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim().slice(0, 80) : '';
}

export async function priceFromLink(url, timeoutMs = 6000) {
  if (!/^https?:\/\//i.test(url)) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
    });
    if (!r.ok) return null;
    const html = (await r.text()).slice(0, 2000000);
    const krw = priceFromHtml(html);
    return krw ? { krw, title: titleFromHtml(html) } : null;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
