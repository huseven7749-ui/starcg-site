// 星詠魔力工具站 Service Worker（離線外殼＋快取策略）
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const SHELL = 'shell-' + VERSION, PAGES = 'pages-' + VERSION, API = 'api-' + VERSION, MEDIA = 'media-v1';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== MEDIA && !k.endsWith(VERSION)).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function cacheFirst(req, name) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) (await caches.open(name)).put(req, res.clone());
  return res;
}
async function staleWhileRevalidate(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  const net = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
  return hit || net;
}
async function networkFirst(req, name, fallback) {
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(name)).put(req, res.clone());
    return res;
  } catch {
    return (await caches.match(req)) || (fallback ? caches.match(fallback) : Response.error());
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return e.respondWith(networkFirst(req, API));
  if (url.pathname.startsWith('/assets/')) return e.respondWith(cacheFirst(req, SHELL));
  if (url.pathname.startsWith('/img/') || url.pathname.startsWith('/icons/') || url.pathname === '/data/pets.json') return e.respondWith(staleWhileRevalidate(req, MEDIA));
  if (req.mode === 'navigate') return e.respondWith(networkFirst(req, PAGES, '/offline.html'));
});
