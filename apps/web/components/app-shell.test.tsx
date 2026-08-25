import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/chat",
}));

vi.mock("@/components/app-install-banner", () => ({
  AppInstallBanner: () => null,
}));

vi.mock("@/components/app-update-gate", () => ({
  AppUpdateGate: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/components/native-bridge-runtime", () => ({
  NativeBridgeRuntime: () => null,
}));

describe("AppShell chat product route", () => {
  it("채팅 route에서는 starter header를 숨기고 chat surface가 화면을 소유한다", () => {
    const html = renderToStaticMarkup(
      createElement(AppShell, null, createElement("p", null, "채팅 화면")),
    );

    expect(html).toContain('class="app-shell app-shell-chat"');
    expect(html).toContain('class="chat-product-main"');
    expect(html).not.toContain("Runtime boundary starter");
    expect(html).toContain("채팅 화면");
  });
});
