/* Service worker — généré au build (core/templates/service-worker.js).
   - pages : réseau d'abord, repli sur le cache puis sur /offline.html
   - fichiers versionnés (hash) : cache d'abord, immuables
   - API /proxy/* : réseau d'abord, dernière réponse connue hors ligne (fiches consultées)
   Les images produits (autre origine, réponses opaques) ne sont pas mises en cache :
   Chrome compte ~7 Mo de quota par réponse opaque. */
const VERSION = '__VERSION__';
const STATIC_CACHE = `static-${VERSION}`;
const PAGES_CACHE = 'pages-v1';
const API_CACHE = 'api-v1';
const PRECACHE = __PRECACHE__;
const MAX_ENTRIES = { [PAGES_CACHE]: 40, [API_CACHE]: 120 };

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keep = new Set([STATIC_CACHE, PAGES_CACHE, API_CACHE]);
        for (const key of await caches.keys()) if (!keep.has(key)) await caches.delete(key);
        await self.clients.claim();
    })());
});

async function trim(cacheName) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    const excess = keys.length - (MAX_ENTRIES[cacheName] || 100);
    for (let i = 0; i < excess; i += 1) await cache.delete(keys[i]);
}

async function networkFirst(request, cacheName, fallbackUrl) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const copy = response.clone();
            caches.open(cacheName).then((cache) => cache.put(request, copy)).then(() => trim(cacheName));
        }
        return response;
    } catch (error) {
        const cached = await caches.match(request, { ignoreVary: true });
        if (cached) return cached;
        if (fallbackUrl) return caches.match(fallbackUrl);
        throw error;
    }
}

async function cacheFirst(request, cacheName) {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) {
        const copy = response.clone();
        caches.open(cacheName).then((cache) => cache.put(request, copy)).then(() => trim(cacheName));
    }
    return response;
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    // Espace de gestion : jamais de copie hors ligne (données privées)
    if (url.pathname.startsWith('/gestion')) return;

    if (url.origin === self.location.origin) {
        if (request.mode === 'navigate') {
            event.respondWith(networkFirst(request, PAGES_CACHE, '/offline.html'));
        } else if (url.pathname.startsWith('/proxy/')) {
            event.respondWith(networkFirst(request, API_CACHE));
        } else if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
            event.respondWith(cacheFirst(request, STATIC_CACHE));
        }
    }
});
