import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PwaStartup, pwaRefreshDestination } from "./pwa-startup";

describe("PWA startup refresh", () => {
  it("renders a route-neutral splash while checking the persisted session", () => {
    const markup = renderToStaticMarkup(<PwaStartup />);

    expect(markup).toContain('data-fullscreen-status="true"');
    expect(markup).toContain("자동 로그인 중입니다.");
    expect(markup).not.toContain('data-platform-shell="true"');
  });

  it("routes successful and expired sessions without treating outages as logout", () => {
    expect(pwaRefreshDestination("authenticated")).toBe("/home");
    expect(pwaRefreshDestination("unauthorized")).toBe("/login?returnTo=%2Fhome");
    expect(pwaRefreshDestination("unavailable")).toBeNull();
  });
});
