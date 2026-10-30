import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";

vi.mock("@/components/app-update-gate", () => ({
  AppUpdateGate: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/components/native-bridge-runtime", () => ({
  NativeBridgeRuntime: () => null,
}));

describe("AppShell", () => {
  it("전역 runtime만 조립하고 route가 화면 layout과 main landmark를 소유하게 한다", () => {
    const html = renderToStaticMarkup(
      createElement(AppShell, null, createElement("main", null, "플랫폼 화면")),
    );

    expect(html).toContain('class="app-shell"');
    expect(html).toContain('class="app-route-content"');
    expect(html).not.toContain("Runtime boundary starter");
    expect(html.match(/<main/g)).toHaveLength(1);
    expect(html).toContain("플랫폼 화면");
  });
});
