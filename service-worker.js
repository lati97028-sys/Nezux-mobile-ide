// Nezux IDE - Service Worker
const CACHE = 'nezux-ide-v1';
const ASSETS = [
  './',
  './splash.html',
  './editor.html',
  './run.html',
  './settings.html',
  './manifest.json',
  './css/main.css',
  './css/layout.css',
  './css/editor.css',
  './css/terminal.css',
  './js/app.js',
  './js/editor.js',
  './js/runner.js',
  './js/fileManager.js',
  './js/settings.js',
  './js/builder.js',
  './js/pwa.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      if (res.ok && e.request.url.startsWith(self.location.origin)) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    })).catch(() => caches.match('./editor.html'))
  );
});
