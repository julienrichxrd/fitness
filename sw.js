// Service worker : garde l'application en cache pour fonctionner hors ligne,
// et n'installe une nouvelle version que lorsque l'utilisateur appuie sur « Mettre à jour ».
// VERSION doit être identique à APP_VERSION dans version.js (vérifié par les tests).
const VERSION = '1.0.0';
const CACHE = `fitness-app-${VERSION}`;
const ASSETS = [
  './',
  './app.css',
  './app.js',
  './backup.js',
  './body.js',
  './cycle.js',
  './dates.js',
  './endurance.js',
  './exercises.json',
  './font-600.woff2',
  './font-800.woff2',
  './foods.json',
  './guide.js',
  './history-views.js',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './index.html',
  './manifest.webmanifest',
  './more-views.js',
  './nutrition-views.js',
  './nutrition.js',
  './program.js',
  './programme-cycle-1.json',
  './programs.js',
  './progress-views.js',
  './review.js',
  './settings.js',
  './sheets.js',
  './storage.js',
  './suggest.js',
  './ui.js',
  './version.js',
  './views.js',
  './workout-views.js',
  './workout.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))),
  );
  // Pas de skipWaiting automatique : la nouvelle version attend l'accord de l'utilisateur.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('fitness-app-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (msg.type === 'SKIP_WAITING') self.skipWaiting();
  if (msg.type === 'STATUS' && event.ports[0]) {
    caches.open(CACHE)
      .then((cache) => Promise.all(ASSETS.map((u) => cache.match(u))))
      .then((hits) => {
        const cached = hits.filter(Boolean).length;
        event.ports[0].postMessage({ version: VERSION, cached, total: ASSETS.length, ready: cached === ASSETS.length });
      });
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // Toute ouverture de page sert la page d'accueil en cache : fonctionne sans réseau.
    event.respondWith(caches.match('./index.html', { ignoreSearch: true }).then((hit) => hit || fetch(req)));
    return;
  }
  event.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
});
