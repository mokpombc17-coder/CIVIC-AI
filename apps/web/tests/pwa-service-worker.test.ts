import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = path.resolve(import.meta.dirname, "..");
const workerPath = path.join(webRoot, "public/sw.js");

const persistentAssets = [
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
  it("PWA 시작 shell과 버전 지정 공통 자산만 캐시한다", () => {
    const source = readFileSync(workerPath, "utf8");

    expect(source).toContain('const PWA_START_URL = "/pwa/start"');
    expect(source).toContain("const PWA_CACHE = `${PWA_CACHE_PREFIX}v3`");
    expect(source).toContain("key.startsWith(PWA_CACHE_PREFIX)");
    expect(source).toContain("isPersistentAsset(url.pathname)");
    expect(source).toContain("isPwaBuildAsset(url.pathname)");
    expect(source).toContain("cache.put(request, response.clone())");
    expect(source).toContain("isPwaBuildAsset(asset.pathname)");
    expect(source).toContain('url.pathname.startsWith("/api/")');
    expect(source).not.toContain("/api/v1/auth/refresh");
    expect(source).not.toContain("civic_ai_access_token");
    expect(source).not.toContain("civic_ai_refresh_token");
    expect(source).not.toContain("/assets/participant-swipe-bootstrap.js");

    const buildCacheFunction = source.match(
      /async function cachedPwaBuildAsset\(request\) \{[\s\S]*?\n\}/u,
    )?.[0];
    expect(buildCacheFunction).toBeDefined();
    expect(buildCacheFunction).not.toContain("cache.put");
  });

  it("persistent asset URL 버전을 실제 콘텐츠 해시와 동기화한다", () => {
    const worker = readFileSync(workerPath, "utf8");

    for (const asset of persistentAssets) {
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
