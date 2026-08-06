import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PublicRoomSearchForm } from "@/components/public-room-search-form";
import type { PublicRoomSearchController } from "@/components/use-public-room-search";

describe("public Room search form", () => {
  it("버튼 검색과 전체·카테고리 필터를 표시한다", () => {
    const html = renderSearchForm();

    expect(html).toContain('role="search"');
    expect(html).toContain('aria-label="공개 채팅방 검색"');
    expect(html).toContain("방 제목 검색");
    expect(html).toContain("방 제목을 입력해 주세요");
    expect(html).toContain('type="submit"');
    expect(html).toContain("검색");
    expect(html).toContain('<option value="" selected="">전체</option>');
    expect(html).toContain("정책");
    expect(html).toContain("환경");
    expect(html).toContain("지역 현안");
    expect(html).toContain("검색 버튼을 누르면 적용");
  });

  it("선택된 카테고리와 검색어 validation을 접근 가능한 상태로 표시한다", () => {
    const html = renderSearchForm({
      category: "ENVIRONMENT",
      draftQuery: "환경\n정책",
      validationMessage: "검색어에 제어 문자를 포함할 수 없습니다.",
    });

    expect(html).toContain('<option value="ENVIRONMENT" selected="">환경</option>');
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
        category: undefined,
        draftQuery: "",
        endComposition: vi.fn(),
        isComposing: false,
        setCategory: vi.fn(),
        setDraftQuery: vi.fn(),
        startComposition: vi.fn(),
        validationMessage: undefined,
        ...patch,
      },
    }),
  );
}
