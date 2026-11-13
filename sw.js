const CACHE = 'aurevia-shell-v2.3.93';
const SHELL = [
  '/', '/index.html', '/style.css', '/app.js', '/analysis.js', '/indicators.js',
  '/structure.js', '/market-hours.js', '/patterns.js', '/risk.js', '/journal.js', '/trade-management.js', '/confluence.js', '/fibonacci.js', '/volume-profile.js', '/opportunity-engine.js',
  '/auth.js', '/contract-engine.js', '/news.js', '/galaxy.js', '/manifest.webmanifest',
  '/assets/aurevia-logo-mark.png', '/assets/aurevia-app-icon.png',
  '/assets/aurevia-app-icon-192.png', '/assets/aurevia-app-icon-maskable.png',
  '/assets/aurevia-apple-touch-icon.png', '/assets/aurevia-mark.svg', '/assets/aurevia-nebula-reference.jpg'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/.netlify/')) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok && (url.pathname === '/' || SHELL.includes(url.pathname))) {
      const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy));
    }
    return response;
  }).catch(() => caches.match(event.request).then(hit => hit || caches.match('/index.html'))));
});
