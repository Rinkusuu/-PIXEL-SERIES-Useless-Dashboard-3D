/* ============================================================================
   sw-template.js — the service worker, before the build fills in the blanks.

   The precache token below is replaced at build time by vite.config.js with the
   real, content-hashed asset list. Hardcoding `index-abc123.js` here would be a
   lie that survives exactly one build.

   TWO CACHING STRATEGIES, because the app has two kinds of thing in it:

     · THE SHELL (html, js, css, fonts) — cache-first. It is versioned by
       content hash, so a cached copy is never stale; if the hash changed, the
       filename changed, and it isn't in the cache.

     · THE WORLD'S FACTS (weather, ISS, quotes) — network-first, falling back to
       the last response we saw. Stale weather is not a lie as long as the app
       says how old it is, and the WeatherWidget does. Silence would be worse.

   Nothing here caches opaque cross-origin responses blindly: the API responses
   are cached deliberately, by URL, so the app can be honest about their age.
   ========================================================================== */

const VERSION = '__VERSION__';
const SHELL = `uad-shell-${VERSION}`;
const DATA = 'uad-data';

const PRECACHE = __PRECACHE__;

/* The hosts whose answers are worth keeping when the network goes away. */
const DATA_HOSTS = [
  'api.open-meteo.com',
  'api.bigdatacloud.net',
  'api.wheretheiss.at',
  'dummyjson.com',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(PRECACHE))
      // Take over immediately. A dashboard is not a document you have several
      // tabs of; waiting for every client to close to activate a new version is
      // ceremony with no beneficiary.
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            // Drop old SHELL caches; keep DATA, which is deliberately unversioned
            // — last week's weather is still the most recent weather we have.
            .filter((k) => k.startsWith('uad-shell-') && k !== SHELL)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // ── The world's facts: network first, last-known second ───────────────────
  if (DATA_HOSTS.includes(url.hostname)) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          // Only cache a real answer. A 500 is not worth remembering.
          if (res.ok) {
            const copy = res.clone();
            caches.open(DATA).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then(
            (hit) =>
              hit ??
              // No network AND nothing cached. Fail honestly; the services all
              // have a local fallback and every one of them says so out loud.
              new Response(JSON.stringify({ offline: true }), {
                status: 503,
                headers: { 'Content-Type': 'application/json' },
              })
          )
        )
    );
    return;
  }

  // ── The shell: cache first ────────────────────────────────────────────────
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;

      return fetch(req)
        .then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(SHELL).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => {
          /* A navigation that misses the cache and has no network still has to
             produce a page — otherwise a hard refresh while offline shows the
             browser's dinosaur instead of the world we already have on disk. */
          if (req.mode === 'navigate') return caches.match('/index.html');
          return new Response('', { status: 504 });
        });
    })
  );
});
