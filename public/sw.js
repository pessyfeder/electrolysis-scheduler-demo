/*
 * Offline support for Electrolysis Scheduler.
 *
 * Every page and the code it needs is saved on the device, so the app opens and works without internet.
 * - Pages: network first (always fresh when online), saved copy when offline.
 * - /assets/* (hashed, never change): saved copy first.
 * - Google Fonts: saved copy, refreshed in the background.
 * After each online page load the saved code is re-checked against the latest release, so routes the
 * practitioner hasn't visited since an update still work offline, and old files are cleared out.
 * Studio records never pass through here — they live in the browser's own storage.
 */
const VERSION = "v1";
const PAGES = `lumiere-pages-${VERSION}`;
const ASSETS = `lumiere-assets-${VERSION}`;
const FONTS = `lumiere-fonts-${VERSION}`;
const ROUTES = ["/", "/book", "/schedule", "/availability", "/clients", "/backup"];
const STATIC = ["/manifest.webmanifest", "/favicon.ico", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png", "/icons/icon.svg"];
const ASSET_REF = /\/?assets\/[\w.-]+\.(?:js|css|woff2?|png|svg|jpg|webp)/g;

self.addEventListener("install", (event) => {
  event.waitUntil(saveEverything().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = new Set([PAGES, ASSETS, FONTS]);
    for (const key of await caches.keys()) if (key.startsWith("lumiere-") && !keep.has(key)) await caches.delete(key);
    await self.clients.claim();
  })());
});

/** Saves every page plus all the code files they reference (following references between code files). */
async function saveEverything() {
  const pages = await caches.open(PAGES);
  const htmls = [];
  for (const route of ROUTES) {
    try {
      const response = await fetch(route, { cache: "no-store" });
      if (!response.ok) continue;
      await pages.put(route, response.clone());
      htmls.push(await response.text());
    } catch { /* offline during install: keep whatever was saved before */ }
  }
  const statics = await caches.open(ASSETS);
  await Promise.all(STATIC.map((url) => fetch(url).then((r) => r.ok && statics.put(url, r)).catch(() => {})));
  if (htmls.length) await saveAssets(htmls);
}

/** Follows asset references from the given page/code text, saving each file once, then drops files no longer used. */
async function saveAssets(texts) {
  const cache = await caches.open(ASSETS);
  const seen = new Set();
  const queue = texts.flatMap(refs);
  while (queue.length) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    let response = await cache.match(url);
    if (!response) {
      try {
        response = await fetch(url);
        if (!response.ok) continue;
        await cache.put(url, response.clone());
      } catch { continue; }
    }
    if (url.endsWith(".js") || url.endsWith(".css")) queue.push(...refs(await response.text()));
  }
  // Clear out code from older releases (never the icons/manifest).
  for (const request of await cache.keys()) {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/assets/") && !seen.has(path)) await cache.delete(request);
  }
}

function refs(text) {
  return [...new Set((text.match(ASSET_REF) || []).map((ref) => (ref.startsWith("/") ? ref : `/${ref}`)))];
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === "https://fonts.googleapis.com" || url.origin === "https://fonts.gstatic.com") {
    event.respondWith(staleWhileRevalidate(request, FONTS));
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(pageFromNetworkThenCache(request, url, event));
    return;
  }
  if (url.pathname.startsWith("/assets/") || STATIC.includes(url.pathname)) {
    event.respondWith(caches.match(request, { ignoreSearch: true }).then((hit) => hit || fetch(request).then((response) => {
      if (response.ok) { const copy = response.clone(); caches.open(ASSETS).then((cache) => cache.put(url.pathname, copy)); }
      return response;
    })));
  }
});

async function pageFromNetworkThenCache(request, url, event) {
  const route = ROUTES.includes(url.pathname) ? url.pathname : null;
  try {
    const response = await fetch(request);
    if (response.ok && route) {
      const copy = response.clone();
      // Keep the saved page and its code current with the latest release, without slowing this load.
      event.waitUntil((async () => {
        const cache = await caches.open(PAGES);
        await cache.put(route, copy.clone());
        await saveAssets([await copy.text()]);
      })());
    }
    return response;
  } catch {
    const saved = (route && (await caches.match(route, { cacheName: PAGES }))) || (await caches.match("/", { cacheName: PAGES }));
    return saved || new Response("<h1>Offline</h1><p>Open the app once while online so it can be saved on this tablet.</p>", { headers: { "content-type": "text/html; charset=utf-8" }, status: 503 });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const fresh = fetch(request).then((response) => { if (response.ok || response.type === "opaque") cache.put(request, response.clone()); return response; }).catch(() => hit);
  return hit || fresh;
}
