// DM-ийн дүрэмд суурилсан монгол хариулагч (AI-гүй — найдвартай, үнэгүй)
import { calcQuote, parseKrw, parseWeight, quoteText, fmt } from './_pricing.js';
import { getSession, setSession, clearSession, getOrder, newOrderId, saveOrder, pauseBot } from './_db.js';

const SITE = process.env.SITE_URL || 'https://arishopkorea.vercel.app';
const DAYS = process.env.DELIVERY_DAYS || '7–14';
const PAYMENT =
  process.env.PAYMENT_INFO ||
  'QPay эсвэл Хаан банкаар төлнө. Дансны мэдээллийг ажилтан тань руу илгээнэ. Гүйлгээний утгад захиалгын дугаараа бичээрэй.';

const has = (t, words) => words.some((w) => t.includes(w));

const FAQ = [
  { keys: ['хэд хоног', 'хэзээ ирэх', 'хугацаа', 'удах уу', 'хүргэлт'], answer: `🚚 Солонгосоос Улаанбаатар хүртэл ${DAYS} хоног болдог.` },
  { keys: ['төлбөр', 'данс', 'qpay', 'хаан банк', 'яаж төлөх'], answer: '💳 ' + PAYMENT },
  {
    keys: ['яаж захиал', 'захиалга өгөх', 'захиалмаар'],
    answer:
      '🛒 Coupang, Naver, Olive Young, Musinsa зэргээс авах барааныхаа линк болон вон дээрх үнийг бичээд явуулаарай.\nЖишээ: https://coupang.com/... 35000вон',
  },
  { keys: ['сайт', 'вэб', 'хаана байдаг'], answer: '🌐 ' + SITE },
];

const HELP = [
  'Сайн байна уу! АриШоп 🇰🇷→🇲🇳',
  '• Үнэ бодуулах: барааны линк + вон дээрх үнэ (жишээ: 35000вон)',
  '• Захиалга шалгах: захиалгын дугаар (жишээ: ARI-1001)',
  '• Бусад: "хүргэлт", "төлбөр" гэж бичээрэй',
  'Хүнтэй ярих бол "оператор" гэж бичээрэй.',
].join('\n');

export async function handleMessage(psid, raw) {
  const text = String(raw).trim();
  const t = text.toLowerCase();

  // 0. Хүн рүү шилжүүлэх
  if (has(t, ['оператор', 'хүнтэй'])) {
    await clearSession(psid);
    await pauseBot(psid);
    return 'Ойлголоо, удахгүй ажилтан хариулна 🙏';
  }

  // 1. Захиалгын дугаар → явц
  const idMatch = text.match(/ARI-\d{4,}/i);
  if (idMatch) {
    const o = await getOrder(idMatch[0]);
    if (!o) return idMatch[0].toUpperCase() + ' дугаартай захиалга олдсонгүй. Дугаараа шалгаад дахин бичээрэй.';
    return `📦 ${o.id}: ${o.status}\nДүн: ${fmt(o.totalMnt)}\nХянах: ${SITE}/track?id=${o.id}`;
  }

  const sess = await getSession(psid);

  // 2. Холбоо барих мэдээлэл хүлээж байгаа
  if (sess && sess.step === 'need_contact' && sess.orderId) {
    const phone = (text.match(/\d{8}/) || [])[0];
    if (!phone) return 'Нэр, 8 оронтой утасны дугаар, хүргүүлэх хаягаа нэг мессежээр бичээрэй.';
    const now = Date.now();
    const order = {
      id: sess.orderId,
      psid,
      name: text.split(/[\n,]/)[0].replace(phone, '').trim().slice(0, 60),
      phone,
      address: text.slice(0, 300),
      link: sess.link || '',
      krw: sess.krw,
      totalMnt: sess.totalMnt,
      status: 'Захиалга авсан',
      createdAt: now,
      updatedAt: now,
      history: [{ status: 'Захиалга авсан', at: now }],
    };
    await saveOrder(order);
    await clearSession(psid);
    return [
      '✅ Захиалга бүртгэгдлээ: ' + order.id,
      'Барааны дүн: ' + fmt(order.totalMnt),
      '',
      '💳 ' + PAYMENT,
      `Төлбөр шалгагдмагц худалдаж авна. Явцаа энд эсвэл ${SITE}/track?id=${order.id} хаягаар хараарай.`,
    ].join('\n');
  }

  // 3. "захиалах" — үнэ бодсоны дараа
  if (sess && sess.step === 'quoted' && has(t, ['захиалах', 'захиална', 'авъя', 'авна'])) {
    if (!sess.krw) return 'Эхлээд барааны үнийг вон-оор бичээрэй (жишээ: 35000вон), тэгээд үнийг бодоод өгье.';
    const orderId = await newOrderId();
    await setSession(psid, { ...sess, step: 'need_contact', orderId });
    return 'Сайн байна! Нэр, утасны дугаар, хүргүүлэх хаягаа нэг мессежээр бичээрэй.';
  }

  // 4. Үнэ бодох
  const krw = parseKrw(text);
  const link = (text.match(/https?:\/\/\S+/) || [])[0];
  if (krw) {
    const q = await calcQuote(krw, parseWeight(text));
    await setSession(psid, { step: 'quoted', krw, totalMnt: q.totalMnt, link: link || (sess && sess.link) || '' });
    return quoteText(q, DAYS);
  }
  if (link) {
    await setSession(psid, { step: 'quoted', krw: 0, totalMnt: 0, link });
    return 'Линк хүлээж авлаа 👍 Сайт дээр харагдаж байгаа үнийг вон-оор бичээрэй (жишээ: 35000вон).';
  }

  // 5. Түгээмэл асуулт
  for (const f of FAQ) if (has(t, f.keys)) return f.answer;

  return HELP;
}

// Пост дээрх сэтгэгдэлд өгөх хариу (зөвхөн худалдан авах сонирхолтой үед)
export function commentReplies(message) {
  const t = String(message || '').toLowerCase();
  if (!has(t, ['үнэ', 'хэд', 'price', 'захиал', 'авъя', 'байгаа юу', 'мэдээлэл', 'dm'])) return null;
  return {
    publicReply: 'Сайн байна уу! Мессежээр дэлгэрэнгүй мэдээлэл илгээлээ 📩',
    dm: 'Сайн байна уу! Сэтгэгдэл бичсэнд баярлалаа 😊 Сонирхсон барааныхаа линк эсвэл вон дээрх үнийг бичвэл төгрөгөөр бодоод өгье.',
  };
}
