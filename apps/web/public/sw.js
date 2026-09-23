const PWA_CACHE_PREFIX = "civic-ai-pwa-";
const PWA_SHELL_CACHE = `${PWA_CACHE_PREFIX}shell-v5`;
const PWA_RUNTIME_CACHE = `${PWA_CACHE_PREFIX}runtime-v5`;
const PWA_ACTIVE_CACHES = new Set([PWA_SHELL_CACHE, PWA_RUNTIME_CACHE]);
const PWA_START_URL = "/pwa/start";
const PWA_SHELL_ASSETS = [PWA_START_URL, "/pwa-start/start.css", "/pwa-start/start.js"];
const PWA_RUNTIME_ASSETS = new Set([
  "/fonts/pretendard-gov/PretendardGOV-Regular.subset.woff2?v=21c9e3b875c6",
  "/fonts/pretendard-gov/PretendardGOV-Medium.subset.woff2?v=6a3b52d655e7",
  "/fonts/pretendard-gov/PretendardGOV-Bold.subset.woff2?v=d09a0a9684b5",
  "/assets/platform-navigation/home.png?v=18ffbf61c717",
  "/assets/platform-navigation/ai.png?v=40d07e5abe75",
  "/assets/platform-navigation/chat.png?v=088425758cd1",
  "/assets/platform-navigation/vote.png?v=21e61dc6c498",
  "/assets/platform-navigation/account.png?v=b19ca424bf3c",
]);

self.addEventListener("install", (event) => {
  event.waitUntil(Promise.all([self.skipWaiting(), cachePwaShell()]));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((key) => key.startsWith(PWA_CACHE_PREFIX) && !PWA_ACTIVE_CACHES.has(key))
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

  if (PWA_SHELL_ASSETS.includes(url.pathname)) {
    event.respondWith(cacheFirstPwaShellAsset(event.request));
    return;
  }

  const runtimeAssetUrl = `${url.pathname}${url.search}`;
  if (event.request.method === "GET" && PWA_RUNTIME_ASSETS.has(runtimeAssetUrl)) {
    event.respondWith(cacheFirstRuntimeAsset(event.request));
  }
});

async function cachePwaShell() {
  const cache = await caches.open(PWA_SHELL_CACHE);
  await cache.addAll(PWA_SHELL_ASSETS);
}

async function cacheFirstPwaShellAsset(request) {
  const cache = await caches.open(PWA_SHELL_CACHE);
  return (await cache.match(request)) ?? fetch(request);
}

async function cacheFirstRuntimeAsset(request) {
  const cache = await caches.open(PWA_RUNTIME_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function networkFirstPwaStart(request) {
  const cache = await caches.open(PWA_SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(PWA_START_URL, response.clone());
    return response;
  } catch {
    return (await cache.match(PWA_START_URL, { ignoreVary: true })) ?? Response.error();
  }
}
