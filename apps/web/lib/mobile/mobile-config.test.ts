import type { NativeContext } from "@repo/bridge";
import { describe, expect, it } from "vitest";
import { getRequiredMobileUpdate, type MobileConfig } from "./mobile-config";

const nativeContext: NativeContext = {
  platform: "android",
  appVersion: "1.2.3",
  buildVersion: "11",
  capabilities: ["app-state"],
};

const config: MobileConfig = {
  store: {
    ios: "https://apps.apple.com/app/id123456789",
    android: "https://play.google.com/store/apps/details?id=com.example.app",
  },
  update: {
    ios: { minimumBuildVersion: 8 },
    android: { minimumBuildVersion: 12 },
  },
  requiredUpdate: null,
  oauth: {
    callbackUrl: "nextwebview://auth/callback",
  },
};

describe("getRequiredMobileUpdate", () => {
  it("requires an update when the native build is below the platform minimum", () => {
    expect(getRequiredMobileUpdate(nativeContext, config)).toEqual({
      platform: "android",
      currentBuildVersion: 11,
      minimumBuildVersion: 12,
      storeUrl: config.store.android,
    });
  });

  it("does not require an update at or above the platform minimum", () => {
    expect(
      getRequiredMobileUpdate(
        {
          ...nativeContext,
          buildVersion: "12",
        },
        config,
      ),
    ).toBeNull();
  });

  it("fails open when the policy or store URL is not configured", () => {
    expect(
      getRequiredMobileUpdate(nativeContext, {
        ...config,
        store: { ...config.store, android: null },
      }),
    ).toBeNull();
    expect(
      getRequiredMobileUpdate(nativeContext, {
        ...config,
        update: {
          ...config.update,
          android: { minimumBuildVersion: null },
        },
      }),
    ).toBeNull();
  });

  it("fails open for a non-numeric native build version", () => {
    expect(
      getRequiredMobileUpdate(
        {
          ...nativeContext,
          buildVersion: "development",
        },
        config,
      ),
    ).toBeNull();
  });
});
