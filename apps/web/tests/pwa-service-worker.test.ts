import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workerPath = path.resolve(import.meta.dirname, "../public/sw.js");

describe("PWA service worker", () => {
  it("is valid JavaScript and caches only the PWA startup shell", () => {
    const source = readFileSync(workerPath, "utf8");

    expect(source).toContain('const PWA_START_URL = "/pwa/start"');
    expect(source).toContain("key.startsWith(PWA_CACHE_PREFIX)");
    expect(source).toContain('url.pathname.startsWith("/api/")');
    expect(source).not.toContain("/api/v1/auth/refresh");
    expect(source).not.toContain("civic_ai_access_token");
    expect(source).not.toContain("civic_ai_refresh_token");
  });
});
