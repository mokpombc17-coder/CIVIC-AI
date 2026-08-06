import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChatRoomCategorySelector } from "@/components/chat-room-category-selector";

describe("ChatRoomCategorySelector", () => {
  it("세 category를 단일 radio group으로 표시하고 현재 선택을 노출한다", () => {
    const html = renderToStaticMarkup(
      createElement(ChatRoomCategorySelector, {
        onSelect: vi.fn(),
        selectedCategory: "ENVIRONMENT",
      }),
    );

    expect(html).toContain("정책");
    expect(html).toContain("환경");
    expect(html).toContain("지역 현안");
    expect(html.match(/name="category"/g)).toHaveLength(3);
    expect(html).toContain('checked="" value="ENVIRONMENT"');
    expect(html).toContain("방을 대표하는 카테고리 하나를 선택해 주세요.");
  });
});
