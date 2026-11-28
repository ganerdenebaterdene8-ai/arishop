// Түр судалгаа: Olive Young / Musinsa-гийн эрэлттэй бараа Naver Shopping-аар (сайтын /api/price) олдох эсэх
import fs from 'node:fs';
const SITE = 'https://arishopkorea.vercel.app/api/price?q=';
const Q = [
 ['OY','브링그린 티트리 시카 수딩 토너'],['OY','메디큐브 제로모공패드'],['OY','바이오힐보 프로바이오덤 리프팅 크림'],
 ['OY','토리든 다이브인 세럼'],['OY','라운드랩 독도 토너'],['OY','아누아 어성초 77 토너'],['OY','웰라쥬 리얼 히알루로닉 블루 앰플'],
 ['OY','롬앤 쥬시 래스팅 틴트'],['OY','클리오 킬커버 쿠션'],['OY','닥터지 레드 블레미쉬 클리어 수딩 크림'],['OY','에스트라 아토베리어365 크림'],
 ['OY','달바 화이트 트러플 미스트 세럼'],['OY','마녀공장 퓨어 클렌징 오일'],['OY','어노브 딥 데미지 트리트먼트'],['OY','넘버즈인 3번 세럼'],
 ['MS','무신사 스탠다드 발마칸 코트'],['MS','무신사 스탠다드 수피마 코튼 니트'],['MS','무신사 스탠다드 경량 패딩'],['MS','아디다스 삼바 OG'],
 ['MS','코드그라피 숏패딩'],['MS','커버낫 후드'],['MS','마하그리드 맨투맨'],['MS','디스이즈네버댓 후드'],['MS','양털 슬리퍼 어그'],
 ['MS','나이키 에어포스1'],['MS','뉴발란스 530'],['MS','수아레 경량 패딩'],['MS','마인드브릿지 가디건']
];
const rows = [];
for (const [src, q] of Q) {
  let d = {};
  try { const r = await fetch(SITE + encodeURIComponent(q)); d = await r.json(); if (!r.ok) d.error = d.error || r.status; } catch (e) { d = { error: String(e) }; }
  const items = d.items || [];
  const malls = [...new Set(items.map((i) => i.mall).filter(Boolean))];
  const prices = items.map((i) => i.krw).sort((a, b) => a - b);
  rows.push({ src, q, count: items.length, withImage: items.filter((i) => i.image).length, malls,
    min: prices[0] || 0, median: prices[Math.floor(prices.length / 2)] || 0, top: (items[0] || {}).title || '', error: d.error || '' });
  await new Promise((r) => setTimeout(r, 400));
}
fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/naver-probe.json', JSON.stringify(rows, null, 2));
console.log(JSON.stringify(rows, null, 1));
