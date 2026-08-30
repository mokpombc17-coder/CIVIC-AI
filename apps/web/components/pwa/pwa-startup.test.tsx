import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PwaStartup } from "./pwa-startup";
import { isStandalonePwa } from "@/lib/pwa/runtime";

describe("PwaStartup", () => {
  it("server-renders only the protected startup splash", () => {
    const html = renderToStaticMarkup(createElement(PwaStartup));

    expect(html).toContain('data-pwa-startup-state="checking"');
    expect(html).toContain("CIVIC.AI");
    expect(html).toContain("로그인 상태를 확인하고 있습니다.");
    expect(html).not.toContain("의견을 가다듬고");
  });

  it("recognizes Chromium and iOS installed display modes", () => {
    const matchMedia = vi.fn().mockReturnValue({ matches: true });

    expect(isStandalonePwa(matchMedia, false)).toBe(true);
    expect(isStandalonePwa(undefined, true)).toBe(true);
    expect(isStandalonePwa(undefined, false)).toBe(false);
  });
});
