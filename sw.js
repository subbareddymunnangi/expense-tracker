/* Service worker: makes the app open offline and installable.
   IMPORTANT: when you change any app file later, change the version number
   below (v2-1 -> v2-2 ...) so phones pick up the new files. */
const CACHE = "knowurexpense-v2-1";
const CORE = [
  "./",
  "index.html",
  "style.css",
  "script.js",
  "sync.js",
  "firebase-config.js",
  "manifest.webmanifest",
  "vendor/chart.umd.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/maskable-512.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function cacheable(url) {
  if (url.origin === self.location.origin) return true;
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") return true;
  if (url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/")) return true;
  return false; /* never cache Firebase API calls (login, database) */
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req, { ignoreSearch: req.mode === "navigate" });
  const network = fetch(req)
    .then((res) => { if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone()); return res; })
    .catch(() => null);
  if (cached) return cached;
  const res = await network;
  if (res) return res;
  if (req.mode === "navigate") {
    const fallback = await cache.match("index.html");
    if (fallback) return fallback;
  }
  return new Response("You are offline.", { status: 503, statusText: "Offline" });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (!cacheable(new URL(req.url))) return;
  event.respondWith(staleWhileRevalidate(req));
});
