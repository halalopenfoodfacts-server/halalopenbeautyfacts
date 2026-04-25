const CACHE_NAME = 'halal-beauty-v1';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/assets/css/style.css',
    '/assets/js/app.js',
    '/assets/js/nav.js',
    '/assets/js/locale.js',
    '/my-lists.html',
    '/dashboard.html',
    '/compare.html',
    '/blog.html',
    '/learn.html',
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache =>
            cache.addAll(STATIC_ASSETS.map(url => new Request(url, { cache: 'reload' })))
        ).catch(() => {})
    );
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);
    if (request.method !== 'GET') return;
    if (url.pathname.startsWith('/proxy/')) return;
    if (request.mode === 'navigate') {
        event.respondWith(fetch(request).catch(() => caches.match('/index.html')));
        return;
    }
    event.respondWith(
        caches.match(request).then(cached => {
            if (cached) return cached;
            return fetch(request).then(response => {
                if (response && response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                }
                return response;
            }).catch(() => cached);
        })
    );
});
