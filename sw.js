// Service worker de La biblioteca de David.
// __BUILD__ lo sustituye el workflow de publicación: cada versión tiene su propia caché.
const BUILD = "__BUILD__";
const APP = `mybooks-app-${BUILD}`;
const COVERS = "mybooks-covers-v1";
const FONTS = "mybooks-fonts-v1";
const MAX_COVERS = 900;

const PRECACHE = [
  "./",
  `assets/style.css?v=${BUILD}`,
  `assets/app.js?v=${BUILD}`,
  `data/library.json?v=${BUILD}`,
  "manifest.webmanifest",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP);
    await cache.addAll(PRECACHE.map((u) => new Request(u, { cache: "reload" })));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith("mybooks-app-") && key !== APP) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    if (url.pathname.endsWith("/version.json")) return; // siempre de la red: sirve para detectar versiones nuevas
    if (req.mode === "navigate") return event.respondWith(page(req));
    return event.respondWith(cacheFirst(req, APP)); // ficheros con ?v=<commit>: nunca cambian
  }
  if (url.hostname.endsWith("gr-assets.com")) return event.respondWith(cacheFirst(req, COVERS, MAX_COVERS));
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") return event.respondWith(cacheFirst(req, FONTS));
});

// La página: primero la red (para ver siempre la última versión), con la copia guardada si no hay conexión
async function page(req) {
  const cache = await caches.open(APP);
  try {
    const res = await Promise.race([fetch(req), new Promise((_, no) => setTimeout(() => no(new Error("lenta")), 4000))]);
    if (res.ok) cache.put("./", res.clone());
    return res;
  } catch {
    return (await cache.match("./")) || fetch(req);
  }
}

async function cacheFirst(req, name, max) {
  const cache = await caches.open(name);
  const hit = await cache.match(req, { ignoreVary: true });
  if (hit) return hit;
  const cross = new URL(req.url).origin !== location.origin;
  // portadas y fuentes admiten CORS: así la copia no es "opaca" (ocupa lo que pesa, no ~7 MB)
  const res = await fetch(cross ? new Request(req.url, { mode: "cors", credentials: "omit" }) : req).catch(() => null)
    || await fetch(req);
  if (res.ok && res.type !== "opaque") {
    await cache.put(req, res.clone());
    if (max) trim(cache, max);
  }
  return res;
}

async function trim(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}
