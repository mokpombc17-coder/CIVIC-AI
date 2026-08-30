import { describe, expect, it } from "vitest";
import { authEndpoint, isInstalledPwa } from "./pwa-auth";

describe("PWA authentication mode", () => {
  it("uses dedicated login, refresh, and logout endpoints only in an installed PWA", () => {
    expect(authEndpoint("login", true)).toBe("/api/v1/auth/pwa/login");
    expect(authEndpoint("refresh", true)).toBe("/api/v1/auth/pwa/refresh");
    expect(authEndpoint("logout", true)).toBe("/api/v1/auth/pwa/logout");
    expect(authEndpoint("login", false)).toBe("/api/v1/auth/login");
    expect(authEndpoint("refresh", false)).toBe("/api/v1/auth/refresh");
    expect(authEndpoint("logout", false)).toBe("/api/v1/auth/logout");
  });

  it("recognizes standalone display mode and the iOS standalone flag", () => {
    expect(
      isInstalledPwa({ matchMedia: () => ({ matches: true }), navigatorStandalone: false }),
    ).toBe(true);
    expect(
      isInstalledPwa({ matchMedia: () => ({ matches: false }), navigatorStandalone: true }),
    ).toBe(true);
    expect(
      isInstalledPwa({ matchMedia: () => ({ matches: false }), navigatorStandalone: false }),
    ).toBe(false);
  });
});
