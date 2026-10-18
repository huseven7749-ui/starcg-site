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

// 每個快取的上限（超過就刪最舊的），避免手機儲存空間一直被吃掉
const LIMIT = { [PAGES]: 60, [API]: 40, [MEDIA]: 300 };
async function trim(name) {
  const max = LIMIT[name];
  if (!max) return;
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}
async function put(name, req, res, e) {
  const cache = await caches.open(name);
  await cache.put(req, res);
  e.waitUntil(trim(name));
}

async function cacheFirst(req, name) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) (await caches.open(name)).put(req, res.clone());
  return res;
}
async function staleWhileRevalidate(req, name, e) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  const net = fetch(req).then(res => { if (res.ok) e.waitUntil(put(name, req, res.clone(), e)); return res; }).catch(() => hit);
  e.waitUntil(net.then(() => {}, () => {}));          // 背景更新不會被瀏覽器中途砍掉
  return hit || net;
}
/** 先上網；網路慢時（超過 timeoutMs）先拿快取的版本，網路回來再更新快取 */
async function networkFirst(req, name, e, { fallback, timeoutMs = 0, store = true } = {}) {
  const net = fetch(req).then(res => { if (store && res.ok) e.waitUntil(put(name, req, res.clone(), e)); return res; });
  e.waitUntil(net.then(() => {}, () => {}));
  try {
    if (!timeoutMs) return await net;
    const hit = await caches.match(req);
    if (!hit) return await net;
    return await Promise.race([net, new Promise(r => setTimeout(() => r(hit), timeoutMs))]);
  } catch {
    return (await caches.match(req)) || (fallback ? caches.match(fallback) : Response.error());
  }
}

// 只有這些 API 值得離線時拿舊資料（匯率、熱門搜尋、寵物圖鑑）；查價、成交、在線人數每次都不一樣，不存
const API_KEEP = /^\/api\/(fx|hot|pets)\.php/;

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) {
    if (!API_KEEP.test(url.pathname)) return;          // 直接走網路，不經過快取
    return e.respondWith(networkFirst(req, API, e));
  }
  if (url.pathname.startsWith('/assets/')) return e.respondWith(cacheFirst(req, SHELL));
  if (url.pathname.startsWith('/img/') || url.pathname.startsWith('/icons/') || url.pathname === '/data/pets.json') return e.respondWith(staleWhileRevalidate(req, MEDIA, e));
  if (req.mode === 'navigate') return e.respondWith(networkFirst(req, PAGES, e, { fallback: '/offline.html', timeoutMs: 3500 }));
});
