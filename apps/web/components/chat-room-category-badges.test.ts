import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatRoomCategoryBadges } from "@/components/chat-room-category-badges";

describe("ChatRoomCategoryBadges", () => {
  it("API enum을 사용자용 label badge로 표시한다", () => {
    const html = renderToStaticMarkup(
      createElement(ChatRoomCategoryBadges, {
        categories: ["POLICY", "ENVIRONMENT", "LOCAL_ISSUE"],
      }),
    );

    expect(html).toContain('aria-label="방 카테고리"');
    expect(html).toContain("정책");
    expect(html).toContain("환경");
    expect(html).toContain("지역 현안");
    expect(html).not.toContain("LOCAL_ISSUE");
  });
});
