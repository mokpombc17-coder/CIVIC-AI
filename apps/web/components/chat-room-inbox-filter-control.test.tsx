import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChatRoomInboxFilterControl } from "./chat-room-inbox-filter-control";

describe("ChatRoomInboxFilterControl", () => {
  it("선택된 필터를 aria-pressed와 Figma chip 스타일로 표시한다", () => {
    const html = renderToStaticMarkup(
      createElement(ChatRoomInboxFilterControl, {
        controller: { select: vi.fn(), value: "UNREAD" },
      }),
    );

    expect(html).toContain('aria-label="참여한 방 필터"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("전체");
    expect(html).toContain("안읽음");
    expect(html).toContain("rounded-[var(--chat-publishing-radius-pill)]");
    expect(html).toContain("h-11");
  });
});
