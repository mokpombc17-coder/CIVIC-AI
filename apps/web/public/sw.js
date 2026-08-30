const PWA_CACHE_PREFIX = "civic-ai-pwa-start-";
const PWA_CACHE = `${PWA_CACHE_PREFIX}v1`;
const PWA_START_URL = "/pwa/start";
const STATIC_ASSETS = [
  "/icons/civic-ai-192.png",
  "/icons/civic-ai-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(cachePwaShell().catch(() => undefined));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((key) => key.startsWith(PWA_CACHE_PREFIX) && key !== PWA_CACHE)
              .map((key) => caches.delete(key)),
          ),
        ),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }

  if (event.request.mode === "navigate" && url.pathname === PWA_START_URL) {
    event.respondWith(networkFirstPwaStart(event.request));
    return;
  }

  if (isPwaShellAsset(url.pathname)) {
    event.respondWith(caches.match(event.request).then((cached) => cached ?? fetch(event.request)));
  }
});

async function cachePwaShell() {
  const cache = await caches.open(PWA_CACHE);
  await Promise.allSettled(STATIC_ASSETS.map((asset) => cache.add(asset)));

  const response = await fetch(PWA_START_URL, { cache: "no-store" });
  if (!response.ok) return;

  const html = await response.clone().text();
  await cache.put(PWA_START_URL, response);
  const shellAssets = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/gu)]
    .map((match) => new URL(match[1], self.location.origin))
    .filter((asset) => asset.origin === self.location.origin && isPwaShellAsset(asset.pathname))
    .map((asset) => asset.href);
  await Promise.allSettled(shellAssets.map((asset) => cache.add(asset)));
}

async function networkFirstPwaStart(request) {
  const cache = await caches.open(PWA_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(PWA_START_URL, response.clone());
    return response;
  } catch {
    return (await cache.match(PWA_START_URL, { ignoreVary: true })) ?? Response.error();
  }
}

function isPwaShellAsset(pathname) {
  return (
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/main-assets/_next/static/") ||
    pathname.startsWith("/icons/")
  );
}
