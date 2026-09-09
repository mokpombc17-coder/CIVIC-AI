import { describe, expect, it, vi } from "vitest";
import { preventMobileLinkContextMenu } from "./mobile-link-interaction";

describe("preventMobileLinkContextMenu", () => {
  it("터치가 주 입력 수단인 환경에서는 링크 context menu를 차단한다", () => {
    const preventDefault = vi.fn();
    const matchMedia = vi.fn(() => ({ matches: true }));

    preventMobileLinkContextMenu({ preventDefault }, matchMedia);

    expect(matchMedia).toHaveBeenCalledWith("(hover: none) and (pointer: coarse)");
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it("데스크톱 환경에서는 기본 context menu를 유지한다", () => {
    const preventDefault = vi.fn();

    preventMobileLinkContextMenu({ preventDefault }, () => ({ matches: false }));

    expect(preventDefault).not.toHaveBeenCalled();
  });
});
