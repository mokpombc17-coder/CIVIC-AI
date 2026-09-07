import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PublicRoomSearchForm } from "@/components/public-room-search-form";
import type { PublicRoomSearchController } from "@/components/use-public-room-search";

describe("public Room search form", () => {
  it("버튼 검색만 표시하고 카테고리 필터는 노출하지 않는다", () => {
    const html = renderSearchForm();
    const labelClass = /<label class="([^"]+)"/.exec(html)?.[1] ?? "";
    const inputClass = /<input[^>]*class="([^"]+)"/.exec(html)?.[1] ?? "";

    expect(html).toContain('role="search"');
    expect(html).toContain('aria-label="공개 채팅방 검색"');
    expect(html).toContain("토론방 이름 검색");
    expect(html).toContain('<span class="font-bold">토론방 이름 검색</span>');
    expect(labelClass).not.toContain("font-bold");
    expect(inputClass).not.toContain("font-bold");
    expect(inputClass).not.toContain("font-normal");
    expect(html).toContain("주제를 검색해 보세요");
    expect(html).toContain('type="submit"');
    expect(html).toContain("검색");
    expect(html).toMatch(/<button class="[^"]*cursor-pointer[^"]*" type="submit">검색/);
    expect(html).not.toContain("<select");
    expect(html).not.toContain("카테고리");
    expect(html).toContain("검색 버튼을 누르면 적용");
  });

  it("검색어 validation을 접근 가능한 상태로 표시한다", () => {
    const html = renderSearchForm({
      draftQuery: "환경\n정책",
      validationMessage: "검색어에 제어 문자를 포함할 수 없습니다.",
    });

    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("검색어에 제어 문자를 포함할 수 없습니다.");
  });

  it("IME 조합 중에는 검색 버튼을 비활성화한다", () => {
    const html = renderSearchForm({ isComposing: true });

    expect(html).toContain('disabled=""');
  });
});

function renderSearchForm(patch: Partial<PublicRoomSearchController> = {}): string {
  return renderToStaticMarkup(
    createElement(PublicRoomSearchForm, {
      controller: {
        appliedQuery: undefined,
        applySearch: vi.fn(),
        draftQuery: "",
        endComposition: vi.fn(),
        isComposing: false,
        setDraftQuery: vi.fn(),
        startComposition: vi.fn(),
        validationMessage: undefined,
        ...patch,
      },
    }),
  );
}
