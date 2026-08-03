// Дроны барааны үнийг Naver Shopping-аас татаж, ₮ болгож Firestore-ийн `prices`-д хадгална.
// Vercel Cron өдөрт 2 удаа дуудна (vercel.json). Гараар: /api/sync-prices?key=<SYNC_KEY>
const PROJECT = 'arishop-2671a';
const FS = 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents/prices/';

// [сайт дээрх барааны нэр, Naver хайлтын үг, санамсаргүй хямд/хуурамч зарыг шүүх түлхүүр]
const CATALOG = [
  ['DJI Mini 4K дрон', 'DJI Mini 4K 드론', 'dji'],
  ['DJI Mini 4 Pro', 'DJI Mini 4 Pro 드론', 'dji'],
  ['DJI Neo селфи дрон', 'DJI Neo 드론', 'dji'],
  ['DJI Flip дрон', 'DJI Flip 드론', 'dji'],
  ['DJI Avata 2 FPV дрон', 'DJI Avata 2 드론', 'dji'],
  ['DJI Air 3S дрон', 'DJI Air 3S 드론', 'dji'],
  ['DJI Mavic 3 Classic', 'DJI Mavic 3 Classic 드론', 'dji'],
  ['Potensic ATOM 2 дрон', 'Potensic ATOM 2 드론', 'potensic'],
  ['HoverAir X1 дрон', 'HoverAir X1 드론', 'hover'],
  ['Хүүхдийн mini дрон LED', '미니드론 LED 어린이', ''],
  ['DJI Goggles N3 нүдний шил', 'DJI Goggles N3', 'dji'],
  ['DJI RC 2 удирдлага', 'DJI RC 2 조종기', 'dji'],
  ['Дроны нэмэлт батарей', 'DJI 인텔리전트 배터리', 'dji'],
  ['Дрон цэнэглэх hub', 'DJI 충전 허브', 'dji'],
  ['Дроны сэнс 4 хос', 'DJI 프로펠러', 'dji'],
  ['Дроны сэнсний хамгаалах тор', 'DJI 프로펠러 가드', ''],
  ['ND шүүлтүүрийн багц', 'DJI ND 필터 세트', ''],
  ['Зөөврийн дроны цүнх', '드론 가방 케이스', ''],
  // Olive Young
  ['Mediheal N.M.F маск 10ш', '메디힐 N.M.F 마스크 10매', '메디힐'],
  ['Torriden Dive-In цэвэрлэгээний хөөс', '토리든 다이브인 폼 클렌저', '토리든'],
  ['Round Lab Birch Juice чийгшүүлэгч', '라운드랩 자작나무 수분 크림', '라운드랩'],
  ['Anua Heartleaf 77 тоник', '아누아 어성초 77 토너', '아누아'],
  ['Skin1004 Madagascar Centella наранцаг SPF50', '스킨1004 센텔라 선크림', '스킨1004'],
  ['Beauty of Joseon Relief наранцаг', '조선미녀 맑은씌 선크림', '조선미녀'],
  ['d\'Alba White Truffle шүршигч серум', '달바 화이트 트러플 미스트 세럼', '달바'],
  ['Ma:nyo Pure Cleansing тос', '마녀공장 퓨어 클렌징 오일', '마녀'],
  ['Abib Heartleaf хөнгөвчлөх маск 10ш', '아비브 어성초 마스크팩', '아비브'],
  ['Goodal Green Tangerine Vita C сарум', '구달 청귤 비타C 세럼', '구달'],
  ['Isntree Hyaluronic тоник', '이즈셬트리 히알론 토너', '이즈셬트리'],
  ['Aestura Atobarrier 365 крем', '에스트라 아토배리어 365 크림', '에스트라'],
  ['Dr.G Red Blemish Clear крем', '닥터지 레드 블댈미쉬 크림', ''],
  ['Bioheal BOH Probioderm лифтинг крем', '바이오힐보 프로바이오더름 크림', ''],
  ['VT Reedle Shot 100 essence', 'VT 리들샷 100', 'vt'],
  ['Mixsoon Bean essence', '믹슨 콩 에센스', '믹슨'],
  ['Wakemake уруулын тинт', '웨이크메이크 립 틴트', '웨이크메이크'],
  ['Peripera Ink Velvet тинт', '페리페라 잉크 벨벳 틴트', '페리페라'],
  ['Clio Kill Cover кушон', '클리오 킬커버 쿠션', '클리오'],
  ['Fwee Pudding Pot блашер', '퓼이 푸딩팟', ''],
  ['Unove Deep Damage үс сэргээгч маск', '어노브 딥 데미지 트리트먼트', '어노브'],
  ['Mise-en-scène Perfect Serum үсний тос', '미장센 퍼펙트 세럼 오일', '미장센'],
  ['Dr.Forhair Folligen шампунь', '닥터포헤어 폴리젠 샴푸', '닥터포헤어'],
  ['Kundal Honey & Macadamia шампунь', '쿤달 샴푸 허니 마카다미아', '쿤달'],
  ['Olive Young Wellage Real Hyaluronic ампул', '웰라쥬 리얼 히알론 액플', '웰라쥬'],
  ['Bringgreen Zinc Teca цэвэрлэгч', '브링그린 징크테카 클렌저', '브링그린'],
  ['Delight Project амтат eyeshadow палитр', '아이쉐도우 팔레트', ''],
  ['Milk Touch Be My First глиттер', '밀크터치 글리터', '밀크터치'],
  // Musinsa
  ['Musinsa Standard оверсайз хүрэм', '무신사 스탠다드 오버사이즈 자켓', '무신사'],
  ['Covernat лого худади', '커버낳 후드', '커버낳'],
  ['Thisisneverthat футболк', '디스이즈네버덧 티셔츠', ''],
  ['Musinsa Standard слакс өмд', '무신사 스탠다드 슬랙스', '무신사'],
  ['Mahagrid график цамц', '마하그리드 티셔츠', '마하그리드'],
  ['Lee жинс өмд', '리 청바지 데님', ''],
  ['Fila кореан пүүз', '휴라 운동화', '휴라'],
  ['Musinsa Standard ноосон коат', '무신사 스탠다드 울 코트', '무신사'],
  ['Romantic Crown малгай', '로맨틱크라운 볼캐프', ''],
  ['Partimento карго өмд', '파르티먼토 카고팬츠', ''],
  // Gmarket / Daiso
  ['Gmarket Big Smile аяга тавгийн багц', '그릇 세트 식기', ''],
  ['Локнлок хадгалах сав 10ш', '락앤락 밀폐용기 세트', '락앤락'],
  ['Солонгос гимбап хийх багц', '김밥 만들기 세트', ''],
  ['Cuckoo даралтат тогоо 10 хүний', '쿠쿠 압력밥솜 10인용', '쿠쿠'],
  ['Кимчи хадгалах хөргөгч сав', '김치통 밀폐용기', ''],
  ['Солонгос рамен 20ш багц', '라면 20개 세트', ''],
  ['Samyang Buldak 40ш багц', '삼양 불닭볶음면 40개', '삼양'],
  ['Жинсэнгийн ханд бэлэгний багц', '홍삼 엑기트 선물세트', ''],
  // Kream sneakers
  ['Nike Dunk Low Panda (Kream баталгаат)', '나이키 덩크 로우 팬다', '나이키'],
  ['Jordan 1 Mid пүүз', '조던 1 미드', '조던'],
  ['New Balance 530 пүүз', '뉴발란스 530', '뉴발란스'],
  ['Adidas Samba OG', '아디다스 삼바 OG', '아디다스'],
  ['Stussy футболк', '스투시 티셔츠', '스투시'],
  ['Supreme малгай', '슈프림 캐프', '슈프림'],
  ['IAB Studio худади', '아이에이비 스튜디오 후드', ''],
  ['Asics Gel-Kayano 14', '아실록 젤카야노 14', '아실록'],
  // ABLY / Zigzag
  ['ABLY зуны даашинз', '여름 원피스', ''],
  ['Zigzag кроп цамц', '크롭 티셔츠 여성', ''],
  ['ABLY өргөн өмд', '와이드 팬츠 여성', ''],
  ['Zigzag кардиган', '가디건 여성', ''],
  ['ABLY түрийвч цүнх', '숙더백 여성', ''],
  ['Zigzag пишмэл юбка', '플리츠 스커트', ''],
  ['ABLY блуз енгийн', '블라우스 여성', ''],
  ['Zigzag намарын тренч коат', '트렌치코트 여성', ''],
  // Danawa
  ['Зөөврийн компьютер LG Gram 16"', 'LG 그램 16', 'lg'],
  ['Гейминг компьютер RTX 4060', '게이밍 PC RTX 4060', ''],
  ['Samsung Odyssey G5 дэлгэц', '삼성 오디세이 G5', '삼성'],
  ['Механик гар Keychron K8', '키크론 K8', '키크론'],
  ['Logitech MX Master 3S хулгана', '로지텍 MX Master 3S', '로지텍'],
  ['График карт RTX 4070', 'RTX 4070 그래픽카드', ''],
  ['SSD Samsung 990 Pro 2TB', '삼성 990 PRO 2TB', '삼성'],
  ['Гейминг сандал', '게이밍 의자', ''],
];

const MARGIN = Number(process.env.MARGIN || 0.15);      // таны маржин
const SHIP_MNT = Number(process.env.SHIP_MNT || 0);     // барааны тээврийн нэмэлт (хүсвэл)
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
  const r = await fetch('https://openapi.naver.com/v1/search/shop.json?display=10&sort=asc&query=' + encodeURIComponent(q), {
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

// хэт хямд (хэрэгсэл/хуурамч) зарыг шүүх: медианы 40%-иас доошийг хаяна
function pick(items, hint) {
  let list = items;
  if (hint) {
    const h = list.filter((i) => (i.brand + ' ' + i.title).toLowerCase().includes(hint));
    if (h.length) list = h;
  }
  if (!list.length) return null;
  const sorted = list.slice().sort((a, b) => a.krw - b.krw);
  const med = sorted[Math.floor(sorted.length / 2)].krw;
  const ok = sorted.filter((i) => i.krw >= med * 0.4);
  return ok[0] || sorted[0];
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
    return res.status(500).json({ error: 'NAVER_ID / NAVER_SECRET / FIREBASE_API_KEY тохируулаагүй' });
  }
  const rate = await krwToMnt();
  const done = [], failed = [];
  for (const [name, query, hint] of CATALOG) {
    try {
      const best = pick(await naver(query), hint);
      if (!best) { failed.push([name, 'no items']); continue; }
      const mnt = Math.round((best.krw * rate * (1 + MARGIN) + SHIP_MNT) / 1000) * 1000;
      await save(name, { query, krw: best.krw, mnt, rate, image: best.image, link: best.link, mall: best.mall });
      done.push({ name, krw: best.krw, mnt });
    } catch (e) {
      failed.push([name, String(e)]);
    }
  }
  res.json({ rate, margin: MARGIN, updated: done.length, failed, done });
}
