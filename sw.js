/* Katzenklappe - Offline-Hülle: die App-Dateien kommen sofort aus dem Speicher und werden im Hintergrund aufgefrischt.
 * Anfragen an GitHub werden nie zwischengespeichert. */
const CACHE = "klappe-v7";
const SHELL = [
  "./", "index.html", "style.css", "theme.js", "logic.js", "looks.js", "lock.js", "api.js", "demo.js", "app.js", "manifest.webmanifest",
  "fonts/fredoka-latin-wght-normal.woff2", "icons/icon-192.png", "icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      const fresh = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      event.waitUntil(fresh.catch(() => {}));
      return hit || fresh;
    })
  );
});
