// Аришоп service worker.
// Хуудас (HTML) үргэлж серверээс шинээр татагдана — шинэ дизайн, засвар апп дээр шууд гарна.
// Интернетгүй үед л кэшээс харуулна. Хувилбарыг өөрчлөхөд хуучин кэш автоматаар устна.
const CACHE = 'arishop-v2-2026-11-28';

self.addEventListener('install', () => { self.skipWaiting(); });

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;
  if (req.url.includes('/api/')) return; // API-г хэзээ ч кэшлэхгүй

  const isPage = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  const fresh = isPage ? fetch(req, { cache: 'no-store' }) : fetch(req);

  e.respondWith(
    fresh
      .then(r => {
        if (r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
        return r;
      })
      .catch(() => caches.match(req))
  );
});
