/* Raye2 service worker.
   Cache only immutable/public shell assets. Never cache navigations, API responses,
   authenticated pages, chat data, creator/admin data, or Supabase requests. */
const CACHE_PREFIX = "raye2-static-";
const CACHE_NAME = CACHE_PREFIX + "v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.add(OFFLINE_URL).catch(() => undefined);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Private and dynamic surfaces are always network-only.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    url.pathname.startsWith("/creator/") ||
    (url.pathname === "/raye2" || url.pathname.startsWith("/raye2/")) ||
    url.pathname.startsWith("/groups/") ||
    url.pathname.startsWith("/_next/data/")
  ) return;

  // HTML is never cached: a failed navigation gets a generic offline explanation.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => {
      const cached = await caches.match(OFFLINE_URL);
      return cached || new Response("Raye2 is offline. Please reconnect and try again.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    }));
    return;
  }

  const isImmutableAsset =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/brand/") ||
    url.pathname === "/icon.png" ||
    url.pathname === "/apple-icon.png";

  if (!isImmutableAsset) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    const cacheControl = response.headers.get("cache-control") || "";
    if (response.ok && response.type === "basic" && !/private|no-store/i.test(cacheControl)) {
      await cache.put(request, response.clone());
    }
    return response;
  })());
});
