import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatRoomCategoryBadges } from "@/components/chat-room-category-badges";

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
});
