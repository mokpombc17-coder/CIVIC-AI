const PWA_CACHE_PREFIX = "civic-ai-pwa-start-";
const PWA_CACHE = `${PWA_CACHE_PREFIX}v3`;
const PWA_START_URL = "/pwa/start";
const PERSISTENT_ASSETS = [
  "/icons/civic-ai-192.png",
  "/icons/civic-ai-512.png",
  "/icons/apple-touch-icon.png",
  "/fonts/pretendard-gov/PretendardGOV-Regular.subset.woff2?v=21c9e3b875c6",
  "/fonts/pretendard-gov/PretendardGOV-Medium.subset.woff2?v=6a3b52d655e7",
  "/fonts/pretendard-gov/PretendardGOV-Bold.subset.woff2?v=d09a0a9684b5",
  "/assets/platform-navigation/home.png?v=18ffbf61c717",
  "/assets/platform-navigation/ai.png?v=40d07e5abe75",
  "/assets/platform-navigation/chat.png?v=088425758cd1",
  "/assets/platform-navigation/vote.png?v=21e61dc6c498",
  "/assets/platform-navigation/account.png?v=b19ca424bf3c",
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

  if (isPersistentAsset(url.pathname)) {
    event.respondWith(cacheFirstPersistentAsset(event.request));
    return;
  }

  if (isPwaBuildAsset(url.pathname)) {
    event.respondWith(cachedPwaBuildAsset(event.request));
  }
});

async function cachePwaShell() {
  const cache = await caches.open(PWA_CACHE);
  await Promise.allSettled(PERSISTENT_ASSETS.map((asset) => cache.add(asset)));

  const response = await fetch(PWA_START_URL, { cache: "no-store" });
  if (!response.ok) return;

  const html = await response.clone().text();
  await cache.put(PWA_START_URL, response);
  const shellAssets = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/gu)]
    .map((match) => new URL(match[1], self.location.origin))
    .filter((asset) => asset.origin === self.location.origin && isPwaBuildAsset(asset.pathname))
    .map((asset) => asset.href);
  await Promise.allSettled(shellAssets.map((asset) => cache.add(asset)));
}

async function cacheFirstPersistentAsset(request) {
  const cache = await caches.open(PWA_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function cachedPwaBuildAsset(request) {
  const cache = await caches.open(PWA_CACHE);
  return (await cache.match(request)) ?? fetch(request);
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

function isPersistentAsset(pathname) {
  return (
    pathname.startsWith("/icons/") ||
    pathname.startsWith("/fonts/pretendard-gov/") ||
    pathname.startsWith("/assets/platform-navigation/")
  );
}

function isPwaBuildAsset(pathname) {
  return pathname.startsWith("/_next/static/") || pathname.startsWith("/main-assets/_next/static/");
}
