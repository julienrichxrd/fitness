// Service worker : garde l'application en cache pour fonctionner hors ligne,
// et n'installe une nouvelle version que lorsque l'utilisateur appuie sur « Mettre à jour ».
// VERSION doit être identique à APP_VERSION dans version.js (vérifié par les tests).
const VERSION = '2.0.0';
const CACHE = `fitness-app-${VERSION}`;
const ASSETS = [
  './',
  './app.css',
  './app.js',
  './backup.js',
  './cycle.js',
  './dates.js',
  './exercises.json',
  './font-600.woff2',
  './font-800.woff2',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './index.html',
  './manifest.webmanifest',
  './program.js',
  './programme-cycle-1.json',
  './screens.js',
  './settings.js',
  './storage.js',
  './suggest.js',
  './version.js',
  './workout.js',
  './img/assisted-dip-machine-0.jpg',
  './img/assisted-dip-machine-1.jpg',
  './img/assisted-pullup-0.jpg',
  './img/assisted-pullup-1.jpg',
  './img/barbell-bench-press-0.jpg',
  './img/barbell-bench-press-1.jpg',
  './img/barbell-rdl-0.jpg',
  './img/barbell-rdl-1.jpg',
  './img/barbell-squat-0.jpg',
  './img/barbell-squat-1.jpg',
  './img/bayesian-cable-curl-0.jpg',
  './img/bayesian-cable-curl-1.jpg',
  './img/bent-over-db-reverse-fly-0.jpg',
  './img/bent-over-db-reverse-fly-1.jpg',
  './img/box-jump-0.jpg',
  './img/box-jump-1.jpg',
  './img/cable-crunch-0.jpg',
  './img/cable-crunch-1.jpg',
  './img/cable-fly-0.jpg',
  './img/cable-fly-1.jpg',
  './img/cable-lateral-raise-0.jpg',
  './img/cable-lateral-raise-1.jpg',
  './img/cable-reverse-fly-0.jpg',
  './img/cable-reverse-fly-1.jpg',
  './img/calf-raise-0.jpg',
  './img/calf-raise-1.jpg',
  './img/chest-press-machine-0.jpg',
  './img/chest-press-machine-1.jpg',
  './img/chest-supported-db-row-0.jpg',
  './img/chest-supported-db-row-1.jpg',
  './img/db-bench-press-0.jpg',
  './img/db-bench-press-1.jpg',
  './img/db-bulgarian-split-squat-0.jpg',
  './img/db-bulgarian-split-squat-1.jpg',
  './img/db-hammer-curl-0.jpg',
  './img/db-hammer-curl-1.jpg',
  './img/db-lateral-raise-0.jpg',
  './img/db-lateral-raise-1.jpg',
  './img/db-rdl-0.jpg',
  './img/db-rdl-1.jpg',
  './img/decline-press-0.jpg',
  './img/decline-press-1.jpg',
  './img/dips-0.jpg',
  './img/dips-1.jpg',
  './img/ez-bar-curl-0.jpg',
  './img/ez-bar-curl-1.jpg',
  './img/ez-skull-crusher-0.jpg',
  './img/ez-skull-crusher-1.jpg',
  './img/hack-squat-0.jpg',
  './img/hack-squat-1.jpg',
  './img/hanging-leg-raise-0.jpg',
  './img/hanging-leg-raise-1.jpg',
  './img/incline-db-curl-0.jpg',
  './img/incline-db-curl-1.jpg',
  './img/incline-db-press-0.jpg',
  './img/incline-db-press-1.jpg',
  './img/lat-pulldown-neutral-0.jpg',
  './img/lat-pulldown-neutral-1.jpg',
  './img/lat-pulldown-pronated-0.jpg',
  './img/lat-pulldown-pronated-1.jpg',
  './img/leg-extension-0.jpg',
  './img/leg-extension-1.jpg',
  './img/leg-press-0.jpg',
  './img/leg-press-1.jpg',
  './img/lying-leg-curl-0.jpg',
  './img/lying-leg-curl-1.jpg',
  './img/machine-lateral-raise-0.jpg',
  './img/machine-lateral-raise-1.jpg',
  './img/machine-shoulder-press-0.jpg',
  './img/machine-shoulder-press-1.jpg',
  './img/one-arm-cable-row-0.jpg',
  './img/one-arm-cable-row-1.jpg',
  './img/one-arm-db-row-0.jpg',
  './img/one-arm-db-row-1.jpg',
  './img/overhead-cable-triceps-ext-0.jpg',
  './img/overhead-cable-triceps-ext-1.jpg',
  './img/pec-deck-0.jpg',
  './img/pec-deck-1.jpg',
  './img/preacher-curl-0.jpg',
  './img/preacher-curl-1.jpg',
  './img/pullup-neutral-0.jpg',
  './img/pullup-neutral-1.jpg',
  './img/pullup-pronated-0.jpg',
  './img/pullup-pronated-1.jpg',
  './img/reverse-pec-deck-0.jpg',
  './img/reverse-pec-deck-1.jpg',
  './img/roman-chair-knee-raise-0.jpg',
  './img/roman-chair-knee-raise-1.jpg',
  './img/rope-hammer-curl-0.jpg',
  './img/rope-hammer-curl-1.jpg',
  './img/rope-pushdown-0.jpg',
  './img/rope-pushdown-1.jpg',
  './img/seated-cable-row-0.jpg',
  './img/seated-cable-row-1.jpg',
  './img/seated-db-overhead-ext-0.jpg',
  './img/seated-db-overhead-ext-1.jpg',
  './img/seated-db-shoulder-press-0.jpg',
  './img/seated-db-shoulder-press-1.jpg',
  './img/seated-leg-curl-0.jpg',
  './img/seated-leg-curl-1.jpg',
  './img/seated-row-machine-0.jpg',
  './img/seated-row-machine-1.jpg',
  './img/smith-calf-raise-0.jpg',
  './img/smith-calf-raise-1.jpg',
  './img/smith-incline-press-0.jpg',
  './img/smith-incline-press-1.jpg',
  './img/smith-squat-0.jpg',
  './img/smith-squat-1.jpg',
  './img/straight-bar-pushdown-0.jpg',
  './img/straight-bar-pushdown-1.jpg',
  './img/vertical-jump-0.jpg',
  './img/vertical-jump-1.jpg',
  './img/walking-lunge-0.jpg',
  './img/walking-lunge-1.jpg',
  './img/weighted-crunch-0.jpg',
  './img/weighted-crunch-1.jpg',
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
