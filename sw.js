// Minimal offline support for the WovenNotes app.
//
// Deliberately does NOT hardcode the HTML file's name — everything runs as a single file,
// so precaching a specific path would break the moment someone renames it. Instead this
// caches whatever gets fetched the first time it's loaded online (the page itself, the
// manifest, the icons), then serves that same cache when the network is unavailable.
// Network-first: always tries to get you the freshest version when you're online, and
// only falls back to what's cached when a fetch actually fails.

// Bumped to v2 with the security pass: the activate handler below deletes every other cache,
// so a previously cached copy of the app (from before the hardening) can't keep being served
// offline once this worker takes over.
const CACHE_NAME = 'wovennotes-cache-v2';

// The only third-party hosts this worker will ever touch (the web font). Anything else that
// isn't this app's own origin is left entirely to the browser — never intercepted, never cached.
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !FONT_HOSTS.includes(url.hostname)) return;
  // partial (Range) responses can't be stored, and there's nothing here worth ranging over
  if (req.headers.has('range')) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      try {
        const response = await fetch(req);
        const cacheControl = (response && response.headers && response.headers.get('Cache-Control')) || '';
        // only keep clean, complete responses, and respect a server's explicit "don't store this"
        if (response && response.ok && response.status === 200 && response.type !== 'opaque' && !/no-store/i.test(cacheControl)) {
          cache.put(req, response.clone()).catch(() => {});
        }
        return response;
      } catch (err) {
        const cached = await cache.match(req);
        if (cached) return cached;
        throw err;
      }
    })
  );
});
