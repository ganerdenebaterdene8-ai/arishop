// Захиалга, чатын төлөв хадгалах — Upstash Redis (Vercel Marketplace-ээс үнэгүй нэмнэ).
// Утас, хаяг агуулдаг тул нийтэд нээлттэй Firestore-д биш, хаалттай Redis-д хадгална.
const URL = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const dbReady = () => !!(URL() && TOKEN());

async function cmd(...args) {
  const r = await fetch(URL(), {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN() },
    body: JSON.stringify(args),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

// Хэрэглэгчийн сүүлийн мессеж (Messenger-ийн 24 цагийн цонх)
export const touchUser = (psid) => cmd('SET', 'last:' + psid, Date.now(), 'EX', 86400);
export const lastUserMsg = async (psid) => Number((await cmd('GET', 'last:' + psid)) || 0);

export const getSession = async (psid) => {
  const s = await cmd('GET', 'sess:' + psid);
  return s ? JSON.parse(s) : null;
};
export const setSession = (psid, s) => cmd('SET', 'sess:' + psid, JSON.stringify(s), 'EX', 86400);
export const clearSession = (psid) => cmd('DEL', 'sess:' + psid);

// Та Page inbox-оос өөрөө хариулсан, эсвэл "оператор" гэсэн үед бот 6 цаг дуугүй болно
export const pauseBot = (psid, sec = 6 * 3600) => cmd('SET', 'pause:' + psid, 1, 'EX', sec);
export const isPaused = async (psid) => !!(await cmd('GET', 'pause:' + psid));

export async function newOrderId() {
  const n = await cmd('INCR', 'order:seq');
  return 'ARI-' + (1000 + Number(n));
}

export async function saveOrder(o) {
  await cmd('SET', 'order:' + o.id, JSON.stringify(o));
  await cmd('ZADD', 'orders', o.createdAt, o.id);
}

export async function getOrder(id) {
  const s = await cmd('GET', 'order:' + String(id).toUpperCase());
  return s ? JSON.parse(s) : null;
}

export async function listOrders(limit = 100) {
  const ids = (await cmd('ZREVRANGE', 'orders', 0, limit - 1)) || [];
  const out = [];
  for (const id of ids) {
    const o = await getOrder(id);
    if (o) out.push(o);
  }
  return out;
}
