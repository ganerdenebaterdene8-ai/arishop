// АриШоп-ын долоо хоногийн статистикийг сайтын /api/bot-stats-аас татаж reports/stats.json болгон хадгална.
// Тооцоолол Vercel дээр явагдана (FB/Firebase/Redis түлхүүрүүд тэнд байгаа) — GitHub-д нууц түлхүүр хэрэггүй.
// .github/workflows/weekly-stats.yml долоо хоног бүр ажиллуулж, bot-data салбарт хадгална.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const STATS_URL = process.env.STATS_URL || 'https://arishopkorea.vercel.app/api/bot-stats';

let out;
try {
  const r = await fetch(STATS_URL, { headers: { 'Cache-Control': 'no-cache' } });
  if (!r.ok) throw new Error(STATS_URL + ' → HTTP ' + r.status);
  out = await r.json();
} catch (e) {
  out = { generatedAt: new Date().toISOString(), facebook: null, orders: null, catalog: null, errors: ['bot-stats: ' + e.message] };
}
fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'reports/stats.json'), JSON.stringify(out, null, 2));
console.log('reports/stats.json бичигдлээ', out.errors && out.errors.length ? out.errors : '');
