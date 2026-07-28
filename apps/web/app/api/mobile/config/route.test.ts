import { createNativeShellUserAgent } from "@repo/bridge";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MobileConfig } from "@/lib/mobile/mobile-config";

vi.mock("server-only", () => ({}));

const androidStoreUrl = "https://play.google.com/store/apps/details?id=com.example.app";

describe("GET /api/mobile/config", () => {
  beforeEach(() => {
    vi.resetModules();
    stubServerEnvironment();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("returns a required update for an older native build", async () => {
    const { response, config } = await requestConfig(
      createNativeShellUserAgent({
        platform: "android",
        appVersion: "1.2.3",
        buildVersion: "11",
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(config).toEqual({
      store: {
        ios: null,
        android: androidStoreUrl,
      },
      update: {
        ios: {
          minimumBuildVersion: null,
        },
        android: {
          minimumBuildVersion: 12,
        },
      },
      requiredUpdate: {
        platform: "android",
        currentBuildVersion: 11,
        minimumBuildVersion: 12,
        storeUrl: androidStoreUrl,
      },
      oauth: {
        callbackUrl: "example-app://auth/callback",
      },
    });
  });

  it("does not require an update at the configured minimum build", async () => {
    const { config } = await requestConfig(
      createNativeShellUserAgent({
        platform: "android",
        appVersion: "1.2.3",
        buildVersion: "12",
      }),
    );

    expect(config.requiredUpdate).toBeNull();
  });

  it("does not treat an ordinary browser as a native shell", async () => {
    const { config } = await requestConfig("Mozilla/5.0 Safari/605.1.15");

    expect(config.requiredUpdate).toBeNull();
    expect(config.update.android.minimumBuildVersion).toBe(12);
  });

  it("fails open when the platform store URL is not configured", async () => {
    vi.stubEnv("ANDROID_PLAY_STORE_URL", "");

    const { config } = await requestConfig(
      createNativeShellUserAgent({
        platform: "android",
        appVersion: "1.2.3",
        buildVersion: "11",
      }),
    );

    expect(config.store.android).toBeNull();
    expect(config.requiredUpdate).toBeNull();
  });
});

async function requestConfig(userAgent: string): Promise<{
  response: Response;
  config: MobileConfig;
}> {
  const { GET } = await import("./route");
  const response = GET(
    new Request("https://app.example.com/api/mobile/config", {
      headers: {
        "User-Agent": userAgent,
      },
    }),
  );

  return {
    response,
    config: (await response.json()) as MobileConfig,
  };
}

function stubServerEnvironment(): void {
  vi.stubEnv("IOS_APP_STORE_URL", "");
  vi.stubEnv("ANDROID_PLAY_STORE_URL", androidStoreUrl);
  vi.stubEnv("IOS_MINIMUM_BUILD_VERSION", "");
  vi.stubEnv("ANDROID_MINIMUM_BUILD_VERSION", "12");
  vi.stubEnv("MOBILE_APP_SCHEME", "example-app");
}
