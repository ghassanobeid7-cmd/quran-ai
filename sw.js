const CACHE_NAME = "tafsir-pwa-v2";

const OFFLINE_ASSETS = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "azkar.html",
  "azkar.js",
  "data/quran.json",
  "data/tafsir_page.json",
  "manifest.json",
  "icom-192.png",
  "icom-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const asset of OFFLINE_ASSETS) {
        try {
          await cache.add(asset);
        } catch {
          // Keep install resilient if one optional asset fails.
        }
      }
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(event.request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          return response;
        })
        .catch(() => caches.match("index.html"));
    })
  );
});
