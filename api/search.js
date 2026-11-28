// Солонгосын дэлгүүрүүдээс (Naver Shopping — Coupang, 11st, Gmarket, Olive Young, Musinsa … нэгтгэдэг) бараа хайх.
// GET /api/search?q=패딩   эсвэл   /api/search?q=өвлийн гутал
// Монгол үгийг жижиг толь бичгээр солонгос руу хөрвүүлнэ. Үнийг сайтын бусад хэсэгтэй ЯГ ижил томьёогоор ₮ болгоно (_pricing.js).
import crypto from 'crypto';
import { krwToMnt } from './_pricing.js';

const MARGIN = Number(process.env.MARGIN || 0.15);
const SHIP_MNT = Number(process.env.SHIP_MNT || 0);

// Түгээмэл монгол үг → солонгос хайлтын үг (урт хэллэгийг түрүүлж шалгана)
const DICT = [
  ['нарны тос', '선크림'], ['наранцаг', '선크림'], ['нүүрний маск', '마스크팩'], ['уруулын будаг', '립스틱'], ['уруулын тинт', '립틴트'],
  ['нүүр угаагч', '클렌징폼'], ['цэвэрлэгч тос', '클렌징오일'], ['үсний тос', '헤어오일'], ['үсний маск', '헤어팩'],
  ['дотуур хувцас', '내의'], ['дулаан дотуур', '발열내의'], ['хөнгөн пуховик', '경량패딩'], ['пуховик', '패딩'], ['куртик', '패딩'],
  ['гар утас', '휴대폰'], ['утасны гэр', '폰케이스'], ['чихэвч', '이어폰'], ['цэнэглэгч', '충전기'], ['зөөврийн компьютер', '노트북'],
  ['хүүхдийн', '아동'], ['эмэгтэй', '여성'], ['эрэгтэй', '남성'], ['өвлийн', '겨울'], ['зуны', '여름'],
  ['крем', '크림'], ['тоник', '토너'], ['сарум', '세럼'], ['серум', '세럼'], ['ампул', '앰플'], ['маск', '마스크팩'], ['лосьон', '로션'],
  ['шампунь', '샴푸'], ['кушон', '쿠션'], ['пудр', '파우더'], ['сүрчиг', '향수'], ['үнэртэн', '향수'], ['тинт', '틴트'],
  ['пүүз', '운동화'], ['гутал', '신발'], ['шаахай', '슬리퍼'], ['ботинк', '부츠'], ['цүнх', '가방'], ['түрийвч', '지갑'],
  ['цамц', '티셔츠'], ['футболк', '티셔츠'], ['худади', '후드티'], ['свитер', '니트'], ['ноосон', '울'], ['хүрэм', '자켓'], ['пальто', '코트'], ['коат', '코트'],
  ['өмд', '바지'], ['жинс', '청바지'], ['даашинз', '원피스'], ['юбка', '스커트'], ['малгай', '모자'], ['ороолт', '목도리'], ['бээлий', '장갑'], ['оймс', '양말'],
  ['тоглоом', '장난감'], ['ном', '책'], ['витамин', '비타민'], ['рамен', '라면'], ['гоймон', '라면'], ['кофе', '커피'], ['цай', '차'],
  ['тогоо', '냄비'], ['будааны тогоо', '전기밥솥'], ['аяга', '컵'], ['хутга', '칼'], ['дэр', '베개'], ['хөнжил', '이불'],
  ['цагаан', '화이트'], ['хар', '블랙'], ['улаан', '레드'], ['ягаан', '핑크'], ['саарал', '그레이'], ['цэнхэр', '블루'], ['ногоон', '그린'], ['бор', '브라운'],
  ['дрон', '드론'], ['камер', '카메라'], ['цаг', '시계'], ['ухаалаг цаг', '스마트워치'], ['дэлгэц', '모니터'], ['гар', '키보드'], ['хулгана', '마우스'],
].sort((a, b) => b[0].length - a[0].length);

export function toKorean(q) {
  let s = ' ' + q.toLowerCase().replace(/\s+/g, ' ') + ' ';
  let hits = 0;
  for (const [mn, ko] of DICT) {
    // Богино үгэнд (цаг, гар…) нөхцөл залгахгүй — "цагаан" → "цаг" гэж андуурахаас сэргийлнэ
    const suffix = mn.length >= 4 ? '([а-яөүё]{0,4})' : '()';
    const re = new RegExp('(^|[\\s,])' + mn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + suffix + '(?=[\\s,]|$)', 'gi');
    s = s.replace(re, (m, pre) => { hits++; return pre + ko; });
  }
  s = s.trim();
  return { query: s, translated: hits > 0, leftoverCyrillic: /[а-яөүё]/i.test(s) };
}

const clean = (t) => String(t || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

// Coupang ("Access Denied") болон Naver Shopping ("접속 제한") нь гаднаас орж ирсэн холбоосыг хаадаг тул жагсаалтад оруулаагүй.
// Хайлтын эх сурвалж бүтэлгүйтвэл хэрэглэгчид Солонгосын дэлгүүрүүдийн хайлтын холбоосыг өгнө (үргэлж ажиллана)
const PAGE_ID = process.env.FB_PAGE_ID || '100068325606493';
const shopLinks = (ko, raw) => {
  const q = encodeURIComponent(ko);
  const msg = encodeURIComponent('Сайн байна уу! "' + raw + '" (' + ko + ') бараа захиалмаар байна. Үнийг нь хэлж өгнө үү.');
  return [
    // Хамгийн найдвартай: Messenger-ээр хүсэлт — манай DM бот/ажилтан Солонгосоос хайж өгнө
    { label: '💬 Messenger-ээр хүсэлт илгээх', url: 'https://m.me/' + PAGE_ID + '?text=' + msg, primary: true },
    // Olive Young, Musinsa — Монголоос нээгддэг (2026-11-28 эзэн шалгасан)
    { label: 'Olive Young', url: 'https://www.oliveyoung.co.kr/store/search/getSearchMain.do?query=' + q },
    { label: 'Musinsa', url: 'https://www.musinsa.com/search/goods?keyword=' + q },
    // Gmarket гаднаас орж ирэхэд "봇 확인" шалгалт гаргадаг (2026-11-28 эзэн шалгасан)
    { label: 'Gmarket', url: 'https://www.gmarket.co.kr/n/search?keyword=' + q },
  ];
};

// 1) Naver Shopping (хуучин openapi.naver.com — 2026 онд хязгаарлагдаж эхэлсэн)
async function naver(query) {
  if (!process.env.NAVER_ID || !process.env.NAVER_SECRET) throw new Error('naver: түлхүүргүй');
  const r = await fetch('https://openapi.naver.com/v1/search/shop.json?display=24&sort=sim&query=' + encodeURIComponent(query), {
    headers: { 'X-Naver-Client-Id': process.env.NAVER_ID, 'X-Naver-Client-Secret': process.env.NAVER_SECRET },
  });
  if (!r.ok) {
    let code = '';
    try { const e = await r.json(); code = e.errorCode || ''; } catch (e) {}
    throw new Error('naver ' + r.status + (code ? ' ' + code : ''));
  }
  const d = await r.json();
  return (d.items || []).map((i) => ({
    title: clean(i.title).slice(0, 90), krw: Number(i.lprice) || 0,
    image: String(i.image || '').replace(/^http:/, 'https:'), link: String(i.link || ''), mall: clean(i.mallName) || 'Naver',
  }));
}

// 2) Coupang Partners (COUPANG_ACCESS_KEY / COUPANG_SECRET_KEY тохируулсан бол)
async function coupang(query) {
  const AK = process.env.COUPANG_ACCESS_KEY, SK = process.env.COUPANG_SECRET_KEY;
  if (!AK || !SK) throw new Error('coupang: түлхүүргүй');
  const PATH = '/v2/providers/affiliate_open_api/apis/openapi/products/search';
  const qs = 'keyword=' + encodeURIComponent(query) + '&limit=20';
  const dt = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z').slice(2);
  const sig = crypto.createHmac('sha256', SK).update(dt + 'GET' + PATH + qs).digest('hex');
  const r = await fetch('https://api-gateway.coupang.com' + PATH + '?' + qs, {
    headers: { Authorization: `CEA algorithm=HmacSHA256, access-key=${AK}, signed-date=${dt}, signature=${sig}` },
  });
  if (!r.ok) throw new Error('coupang ' + r.status);
  const d = await r.json();
  return (((d.data || {}).productData) || []).map((i) => ({
    title: clean(i.productName).slice(0, 90), krw: Number(i.productPrice) || 0,
    image: String(i.productImage || ''), link: String(i.productUrl || ''), mall: 'Coupang',
  }));
}

export default async function handler(req, res) {
  const raw = String((req.query && req.query.q) || '').trim().slice(0, 80);
  if (!raw) return res.status(400).json({ error: 'Хайх үгээ бичнэ үү' });
  const tr = toKorean(raw);
  // Орчуулагдаагүй кирилл үг хайлтад юу ч олдуулахгүй тул хасна
  const query = tr.query.replace(/[а-яөүё]+/gi, ' ').replace(/\s+/g, ' ').trim();
  if (!query) {
    return res.json({ query: raw, searched: '', count: 0, items: [], links: [], hint: 'Солонгос эсвэл англиар бичвэл илүү сайн олдоно (жишээ: 패딩, Nike, sunscreen).' });
  }
  const errors = [];
  let items = [], source = '';
  for (const [name, fn] of [['naver', naver], ['coupang', coupang]]) {
    try { items = await fn(query); source = name; if (items.length) break; } catch (e) { errors.push(e.message); }
  }
  if (errors.length) console.error('search:', errors.join(' | '));
  const rate = await krwToMnt();
  items = items
    .map((i) => ({ ...i, mnt: Math.round((i.krw * rate * (1 + MARGIN) + SHIP_MNT) / 1000) * 1000 }))
    .filter((i) => i.krw >= 1000 && /^https:\/\//.test(i.image) && /^https:\/\//.test(i.link));
  const links = shopLinks(query, raw);
  let hint = tr.leftoverCyrillic ? 'Зарим үгийг орчуулж чадсангүй — солонгос эсвэл англиар бичвэл илүү олдоно.' : '';
  if (!items.length && errors.length) {
    hint = 'Шууд хайлт одоохондоо ажиллахгүй байна. Messenger-ээр хүсэлтээ илгээгээрэй — бид Солонгосоос хайж, үнийг нь хэлж өгнө. Эсвэл дэлгүүрээс өөрөө олоод холбоосыг нь илгээж болно (дэлгүүр "봇 확인" шалгалт гаргаж магадгүй).';
  }
  res.setHeader('Cache-Control', items.length ? 's-maxage=3600, stale-while-revalidate=86400' : 'no-store');
  res.json({ query: raw, searched: query, source, count: items.length, items, links, hint, errors });
}
