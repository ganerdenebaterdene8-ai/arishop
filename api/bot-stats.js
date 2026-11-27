// Ботын долоо хоногийн статистик — FB постын оролцоо, захиалгын нийлбэр тоо, каталогийн төлөв.
// Түлхүүрүүд (FB_PAGE_TOKEN, KV_…, FIREBASE_API_KEY) зөвхөн Vercel дээр байгаа тул энд тооцоолно.
// GitHub Actions (weekly-stats.yml) үүнийг дуудаж bot-data салбарт хадгална.
// Хувийн мэдээлэл (утас, хаяг, нэр, мессеж) энд ОРОХГҮЙ. Мөнгөн дүн ч гаргахгүй — зөвхөн тоо.
import CATALOG from './_catalog.js';

const G = 'https://graph.facebook.com/v21.0/';
const FS = 'https://firestore.googleapis.com/v1/projects/arishop-2671a/databases/(default)/documents/prices/';
const WEEK = 7 * 86400000;
let now = Date.now();
let errors = [];

// 1) Facebook: сүүлийн 14 хоногийн постуудын оролцоо
async function facebook() {
  const { FB_PAGE_ID: PAGE, FB_PAGE_TOKEN: TOKEN } = process.env;
  if (!PAGE || !TOKEN) throw new Error('FB_PAGE_ID / FB_PAGE_TOKEN алга');
  const since = Math.floor((now - 2 * WEEK) / 1000);
  const fields = 'message,created_time,permalink_url,shares,reactions.summary(true).limit(0),comments.summary(true).limit(0)';
  const r = await fetch(G + PAGE + '/posts?limit=50&since=' + since + '&fields=' + encodeURIComponent(fields) + '&access_token=' + TOKEN);
  const d = await r.json();
  if (d.error) throw new Error('facebook: ' + d.error.message);
  const posts = (d.data || []).map((p) => ({
    date: p.created_time,
    text: String(p.message || '').slice(0, 300),
    url: p.permalink_url,
    reactions: p.reactions?.summary?.total_count || 0,
    comments: p.comments?.summary?.total_count || 0,
    shares: p.shares?.count || 0,
  }));
  posts.forEach((p) => (p.score = p.reactions + 3 * p.comments + 5 * p.shares));
  const fans = await fetch(G + PAGE + '?fields=followers_count,fan_count&access_token=' + TOKEN).then((x) => x.json()).catch(() => ({}));
  return { followers: fans.followers_count ?? fans.fan_count ?? null, posts: posts.sort((a, b) => b.score - a.score) };
}

// 2) Захиалга: нийлбэр тоо (Upstash Redis)
async function orders() {
  const URL = process.env.KV_REST_API_URL, TOKEN = process.env.KV_REST_API_TOKEN;
  if (!URL || !TOKEN) return { skipped: 'Upstash Redis (KV_REST_API_URL / KV_REST_API_TOKEN) Vercel дээр тохируулаагүй' };
  const cmd = async (...args) => {
    const r = await fetch(URL, { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN }, body: JSON.stringify(args) });
    const j = await r.json();
    if (j.error) throw new Error(j.error);
    return j.result;
  };
  const ids = (await cmd('ZRANGEBYSCORE', 'orders', now - 4 * WEEK, now)) || [];
  const weeks = [0, 0, 0, 0], byStatus = {}, products = {};
  for (const id of ids) {
    const o = JSON.parse((await cmd('GET', 'order:' + id)) || 'null');
    if (!o) continue;
    const w = Math.min(3, Math.floor((now - o.createdAt) / WEEK));
    weeks[w]++;
    byStatus[o.status] = (byStatus[o.status] || 0) + 1;
    // Захиалгын холбоосын дэлгүүрийг тоолно (coupang.com, smartstore.naver.com …) — хувийн мэдээлэлгүй
    let shop = 'холбоосгүй';
    try { if (o.link) shop = new URL(o.link).hostname.replace(/^www\.|^m\./, ''); } catch (e) {}
    products[shop] = (products[shop] || 0) + 1;
  }
  return {
    note: 'weeks[0] = сүүлийн 7 хоног, weeks[1] = өмнөх 7 хоног …',
    weeks, byStatus,
    byShop: Object.entries(products).sort((a, b) => b[1] - a[1]).slice(0, 15),
  };
}

// 3) Каталог: үнэ/зураггүй, хуучирсан бараа
async function catalog() {
  if (!process.env.FIREBASE_API_KEY) throw new Error('FIREBASE_API_KEY алга');
  const missing = [], stale = [], failed = [];
  const check = async (name) => {
    const r = await fetch(FS + encodeURIComponent(name) + '?key=' + process.env.FIREBASE_API_KEY);
    if (r.status === 404) return missing.push(name);
    if (!r.ok) return failed.push(name + ' (' + r.status + ')');
    const f = (await r.json()).fields || {};
    if (!f.image?.stringValue || !Number(f.mnt?.integerValue)) missing.push(name);
    else if (now - Number(f.updated?.integerValue || 0) > 3 * 86400000) stale.push(name);
  };
  // 10-аар нь зэрэг шалгана (хурдан, Firestore-ийг дарахгүй)
  for (let i = 0; i < CATALOG.length; i += 10) {
    await Promise.all(CATALOG.slice(i, i + 10).map(([name]) => check(name).catch((e) => failed.push(name + ' (' + e.message + ')'))));
  }
  // Firestore-ийн 404 бус алдаа (429/5xx/буруу түлхүүр) — "бараа алга" гэж буруу дүгнэхээс сэргийлнэ
  if (failed.length > CATALOG.length / 2) throw new Error('Firestore олон алдаа: ' + failed.slice(0, 3).join(', '));
  if (failed.length) errors.push('catalog: Firestore алдаа ' + failed.length + ' бараанд: ' + failed.slice(0, 5).join(', '));
  return { total: CATALOG.length, missingPriceOrImage: missing, staleOver3Days: stale, fetchFailed: failed };
}


export default async function handler(req, res) {
  now = Date.now(); errors = [];
  const out = { generatedAt: new Date(now).toISOString(), facebook: null, orders: null, catalog: null, errors };
  for (const [k, fn] of [['facebook', facebook], ['orders', orders], ['catalog', catalog]]) {
    try { out[k] = await fn(); } catch (e) { errors.push(k + ': ' + e.message); }
  }
  res.setHeader('Cache-Control', 's-maxage=600');
  res.json(out);
}
