// Fiesta CRM — Minimal service worker for PWA installability + app shell caching
// Bump CACHE_VERSION to bust the cache on deploys.
const CACHE_VERSION = "fiesta-v5";
const SHELL_CACHE = `shell-${CACHE_VERSION}`;

// Precache the app shell on install
const SHELL_URLS = ["/", "/manifest.json", "/pwa-icon-192.png", "/fonts/Feather.ttf", "/fonts/MaterialCommunityIcons.ttf"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS))
  );
  self.skipWaiting();
});

// Clean up old caches on activate
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== SHELL_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== "GET") return;

  // API calls — network only, never cache
  if (url.pathname.startsWith("/api/")) return;

  // Static assets with hashed filenames — cache first (immutable)
  if (
    url.pathname.includes("/_expo/static/") ||
    url.pathname.startsWith("/assets/")
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(SHELL_CACHE).then((cache) => cache.put(request, clone));
            }
            return response;
          })
      )
    );
    return;
  }

  // Navigation requests — network first, fall back to cached index.html (SPA)
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/"))
    );
    return;
  }

  // Everything else — network first, fall back to cache
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
