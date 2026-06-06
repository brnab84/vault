const CACHE_VERSION = '__CACHE_VERSION__';
const CACHE = 'vault-' + CACHE_VERSION;

self.addEventListener('install', e => {
  e.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => {
        self.clients.matchAll({ type:'window' }).then(clients =>
          clients.forEach(c => c.postMessage({ type:'SW_UPDATED' }))
        );
      })
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Never cache: API, version.json, HTML files
  if (
    url.pathname.startsWith('/api') ||
    url.pathname === '/version.json' ||
    url.pathname.endsWith('.html') ||
    url.pathname === '/' ||
    url.pathname === '/app'
  ) {
    e.respondWith(fetch(e.request));
    return;
  }

  // Cache static assets (icons, manifest)
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fresh = fetch(e.request).then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      });
      return cached || fresh;
    })
  );
});
