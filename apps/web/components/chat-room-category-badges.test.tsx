import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ChatRoomCategoryBadges,
  getFittingCategoryCount,
} from "@/components/chat-room-category-badges";

describe("ChatRoomCategoryBadges", () => {
  it("이름순으로 정렬하고 카드에서는 첫 카테고리와 나머지 개수를 표시한다", () => {
    const html = renderToStaticMarkup(
      createElement(ChatRoomCategoryBadges, {
        categories: [
          { categoryId: "category-policy", name: "정책" },
          { categoryId: "category-environment", name: "환경" },
        ],
      }),
    );

    expect(html).toContain('aria-label="카테고리: 정책, 환경"');
    expect(html).toContain("정책");
    expect(html).toContain("외 1");
    expect(html).toContain("rounded-[4px]");
    expect(html).toContain("px-1.5 py-0.5");
    expect(html).toContain("leading-[18px]");
    expect(html).not.toContain("rounded-full");
  });

  it("표시 개수를 늘리면 상세 화면에서 전체 카테고리를 노출한다", () => {
    const html = renderToStaticMarkup(
      createElement(ChatRoomCategoryBadges, {
        categories: [
          { categoryId: "category-policy", name: "정책" },
          { categoryId: "category-environment", name: "환경" },
        ],
        maxVisible: 5,
      }),
    );

    expect(html).toContain("정책");
    expect(html).toContain("환경");
    expect(html).not.toContain("외 1");
  });

  it("카드 너비 맞춤 모드의 측정 요소와 초기 fallback을 제공한다", () => {
    const html = renderToStaticMarkup(
      createElement(ChatRoomCategoryBadges, {
        categories: [
          { categoryId: "category-policy", name: "정책" },
          { categoryId: "category-environment", name: "환경" },
          { categoryId: "category-region", name: "지역" },
        ],
        fitAvailableWidth: true,
      }),
    );

    expect(html).toContain('data-fit-available-width="true"');
    expect(html).toContain("외 2");
    expect(html.match(/data-category-measure="true"/g)).toHaveLength(3);
  });

  it("남은 개수 너비를 확보한 상태에서 들어가는 카테고리를 최대한 표시한다", () => {
    const hiddenCountWidths = new Map([
      [1, 30],
      [2, 30],
    ]);

    expect(
      getFittingCategoryCount({
        availableWidth: 128,
        categoryWidths: [40, 40, 40],
        gap: 4,
        hiddenCountWidths,
      }),
    ).toBe(3);
    expect(
      getFittingCategoryCount({
        availableWidth: 118,
        categoryWidths: [40, 40, 40],
        gap: 4,
        hiddenCountWidths,
      }),
    ).toBe(2);
    expect(
      getFittingCategoryCount({
        availableWidth: 90,
        categoryWidths: [60, 60, 60],
        gap: 4,
        hiddenCountWidths,
      }),
    ).toBe(1);
  });
});
