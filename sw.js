const CACHE_PREFIX = "achievement-app-shell";
const CACHE_VERSION = "v5";
const CACHE_NAME = `${CACHE_PREFIX}-${CACHE_VERSION}`;
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./images/pwa/icon-192.png?v=20260421a",
  "./images/pwa/icon-512.png?v=20260421a",
  "./images/pwa/apple-touch-icon.png?v=20260421a"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    // Precache only the minimal shell needed for installability and a basic offline launch.
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();

    // Delete older shell caches on activation so a new release does not keep serving stale install assets.
    await Promise.all(
      keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    );

    await self.clients.claim();
  })());
});

async function updateCachedShellAsset(request) {
  try {
    const response = await fetch(request, { cache: "no-cache" });
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return null;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        // Navigations stay network-first so normal page updates are not trapped behind old cached HTML.
        return await fetch(request);
      } catch {
        const fallback = await caches.match("./index.html");
        return fallback || Response.error();
      }
    })());
    return;
  }

  const isShellAsset = APP_SHELL.some((asset) => url.pathname.endsWith(asset.replace(/^\.\//, "/")));
  if (!isShellAsset) return;

  event.respondWith((async () => {
    const cached = await caches.match(request);

    // Serve the cached shell asset immediately, but refresh it in the background for the next visit.
    const networkRefresh = updateCachedShellAsset(request);
    if (cached) {
      void networkRefresh;
      return cached;
    }

    const fresh = await networkRefresh;
    return fresh || Response.error();
  })());
});
