import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const androidFingerprintA = Array.from({ length: 32 }, () => "ab").join(":");
const androidFingerprintB = Array.from({ length: 32 }, () => "cd").join(":");

describe("mobile association routes", () => {
  beforeEach(() => {
    vi.resetModules();
    stubServerEnvironment();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  describe("GET /.well-known/apple-app-site-association", () => {
    it("returns the configured iOS association with public caching", async () => {
      vi.stubEnv("APPLE_TEAM_ID", "ABCDE12345");
      vi.stubEnv("IOS_BUNDLE_IDENTIFIER", "com.example.app");

      const { GET } = await import("./apple-app-site-association/route");
      const response = GET();

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("public, max-age=3600");
      expect(response.headers.get("content-type")).toBe("application/json");
      await expect(response.json()).resolves.toEqual({
        applinks: {
          apps: [],
          details: [
            {
              appID: "ABCDE12345.com.example.app",
              paths: ["*"],
            },
          ],
        },
      });
    });

    it("returns a non-cacheable 404 when iOS association is not configured", async () => {
      const { GET } = await import("./apple-app-site-association/route");
      const response = GET();

      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("no-store");
      await expect(response.json()).resolves.toEqual({
        error: "Mobile association is not configured.",
      });
    });
  });

  describe("GET /.well-known/assetlinks.json", () => {
    it("returns normalized Android asset links with public caching", async () => {
      vi.stubEnv("ANDROID_PACKAGE_NAME", "com.example.app");
      vi.stubEnv(
        "ANDROID_SHA256_CERT_FINGERPRINTS",
        `${androidFingerprintA}, ${androidFingerprintB}`,
      );

      const { GET } = await import("./assetlinks.json/route");
      const response = GET();

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("public, max-age=3600");
      expect(response.headers.get("content-type")).toBe("application/json");
      await expect(response.json()).resolves.toEqual([
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: {
            namespace: "android_app",
            package_name: "com.example.app",
            sha256_cert_fingerprints: [
              androidFingerprintA.toUpperCase(),
              androidFingerprintB.toUpperCase(),
            ],
          },
        },
      ]);
    });

    it("returns a non-cacheable 404 when Android association is not configured", async () => {
      const { GET } = await import("./assetlinks.json/route");
      const response = GET();

      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("no-store");
      await expect(response.json()).resolves.toEqual({
        error: "Mobile association is not configured.",
      });
    });
  });
});

function stubServerEnvironment(): void {
  vi.stubEnv("IOS_APP_STORE_URL", "");
  vi.stubEnv("ANDROID_PLAY_STORE_URL", "");
  vi.stubEnv("IOS_MINIMUM_BUILD_VERSION", "");
  vi.stubEnv("ANDROID_MINIMUM_BUILD_VERSION", "");
  vi.stubEnv("APPLE_TEAM_ID", "");
  vi.stubEnv("IOS_BUNDLE_IDENTIFIER", "");
  vi.stubEnv("ANDROID_PACKAGE_NAME", "");
  vi.stubEnv("ANDROID_SHA256_CERT_FINGERPRINTS", "");
  vi.stubEnv("PUSH_TOKEN_UPSTREAM_URL", "");
  vi.stubEnv("MOBILE_APP_SCHEME", "nextwebview");
}
