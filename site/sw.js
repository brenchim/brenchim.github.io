// Офлайн: оболочка сайта из кэша, данные песен приложение само хранит в localStorage.
// При каждом выпуске меняйте CACHE — открытые вкладки сами перезагрузятся на новую версию.
const CACHE = 'brenchim-v9';
const SHELL = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/store.js', 'js/chords.js', 'js/importers.js', 'js/members.js', 'js/tuner.js', 'js/config.js', 'img/logo.png', 'manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const sameOrigin = url.origin === location.origin;
  const fonts = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !fonts) return;
  // сначала сеть, причём мимо HTTP-кэша браузера (GitHub Pages разрешает держать файлы 10 минут),
  // без сети — из нашего кэша
  const req = sameOrigin ? new Request(e.request, { cache: 'no-cache' }) : e.request;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html')))
  );
});
