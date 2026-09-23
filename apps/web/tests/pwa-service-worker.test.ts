import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = path.resolve(import.meta.dirname, "..");
const workerPath = path.join(webRoot, "public/sw.js");

const runtimeAssets = [
  {
    file: "public/fonts/pretendard-gov/PretendardGOV-Regular.subset.woff2",
    publicPath: "/fonts/pretendard-gov/PretendardGOV-Regular.subset.woff2",
    references: ["app/wireflow-core.css"],
  },
  {
    file: "public/fonts/pretendard-gov/PretendardGOV-Medium.subset.woff2",
    publicPath: "/fonts/pretendard-gov/PretendardGOV-Medium.subset.woff2",
    references: ["app/wireflow-core.css"],
  },
  {
    file: "public/fonts/pretendard-gov/PretendardGOV-Bold.subset.woff2",
    publicPath: "/fonts/pretendard-gov/PretendardGOV-Bold.subset.woff2",
    references: ["app/wireflow-core.css"],
  },
  ...["home", "ai", "chat", "vote", "account"].map((name) => ({
    file: `public/assets/platform-navigation/${name}.png`,
    publicPath: `/assets/platform-navigation/${name}.png`,
    references: ["lib/platform-navigation.ts"],
  })),
] as const;

describe("PWA service worker", () => {
  it("v5 shell만 설치하고 실제 요청된 공통 자산은 별도 runtime cache에 저장한다", () => {
    const source = readFileSync(workerPath, "utf8");

    expect(source).toContain('const PWA_START_URL = "/pwa/start"');
    expect(source).toContain("const PWA_SHELL_CACHE = `${PWA_CACHE_PREFIX}shell-v5`");
    expect(source).toContain("const PWA_RUNTIME_CACHE = `${PWA_CACHE_PREFIX}runtime-v5`");
    expect(source).toContain('"/pwa-start/start.css"');
    expect(source).toContain('"/pwa-start/start.js"');
    expect(source).toContain("cache.addAll(PWA_SHELL_ASSETS)");
    expect(source).toContain("PWA_SHELL_ASSETS.includes(url.pathname)");
    expect(source).toContain("cacheFirstPwaShellAsset(event.request)");
    expect(source).toContain("PWA_RUNTIME_ASSETS.has(runtimeAssetUrl)");
    expect(source).toContain("cacheFirstRuntimeAsset(event.request)");
    expect(source).toContain("key.startsWith(PWA_CACHE_PREFIX)");
    expect(source).toContain("cache.put(request, response.clone())");
    expect(source).toContain('url.pathname.startsWith("/api/")');
    expect(source).not.toContain("PERSISTENT_ASSETS");
    expect(source).not.toContain("isPersistentAsset");
    expect(source).not.toContain("/icons/civic-ai-192.png");
    expect(source).not.toContain("/icons/civic-ai-512.png");
    expect(source).not.toContain("/icons/apple-touch-icon.png");
    expect(source).not.toContain("cachePwaShell().catch");
    expect(source).not.toContain("isPwaBuildAsset");
    expect(source).not.toContain("/_next/static/");
    expect(source).not.toContain("/main-assets/_next/static/");
    expect(source).not.toContain("/api/v1/auth/refresh");
    expect(source).not.toContain("civic_ai_access_token");
    expect(source).not.toContain("civic_ai_refresh_token");
    expect(source).not.toContain("/assets/participant-swipe-bootstrap.js");

    const shellInstallFunction = source.match(
      /async function cachePwaShell\(\) \{[\s\S]*?\n\}/u,
    )?.[0];
    expect(shellInstallFunction).toBeDefined();
    expect(shellInstallFunction).not.toContain("PWA_RUNTIME_ASSETS");
    expect(shellInstallFunction).not.toContain("PWA_RUNTIME_CACHE");
  });

  it("runtime asset URL 버전을 실제 콘텐츠 해시와 동기화한다", () => {
    const worker = readFileSync(workerPath, "utf8");

    for (const asset of runtimeAssets) {
      const digest = createHash("sha256")
        .update(readFileSync(path.join(webRoot, asset.file)))
        .digest("hex")
        .slice(0, 12);
      const versionedUrl = `${asset.publicPath}?v=${digest}`;

      expect(worker).toContain(versionedUrl);
      for (const reference of asset.references) {
        expect(readFileSync(path.join(webRoot, reference), "utf8")).toContain(versionedUrl);
      }
    }
  });
});
