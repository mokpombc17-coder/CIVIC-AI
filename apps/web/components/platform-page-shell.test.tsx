import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PlatformPageShell } from "./platform-page-shell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/home",
}));

describe("PlatformPageShell", () => {
  it("일반 platform route에 기본 header, pathname navigation과 self scroll을 조립한다", () => {
    const markup = renderToStaticMarkup(
      <PlatformPageShell title="홈">
        <p>홈 콘텐츠</p>
      </PlatformPageShell>,
    );

    expect(markup).toContain('data-platform-shell="true"');
    expect(markup.match(/data-scroll="self"/g)).toHaveLength(2);
    expect(markup).toContain('data-state="disabled"');
    expect(markup).toMatch(/aria-current="page" href="\/home"/);
    expect(markup).toContain("홈 콘텐츠");
  });
});
