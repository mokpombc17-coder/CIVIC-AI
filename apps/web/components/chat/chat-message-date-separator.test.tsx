import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ChatMessageDateSeparator,
  formatChatMessageDateSeparator,
} from "./chat-message-date-separator";
import type { ChatMessageTimelineDate } from "@/lib/chat/chat-message-timeline";

describe("formatChatMessageDateSeparator", () => {
  const now = new Date("2026-08-07T03:00:00Z");

  it.each([
    [{ day: 7, key: "2026-08-07", month: 8, year: 2026 }, "오늘"],
    [{ day: 6, key: "2026-08-06", month: 8, year: 2026 }, "어제"],
    [{ day: 1, key: "2026-08-01", month: 8, year: 2026 }, "8월 1일"],
    [{ day: 31, key: "2025-12-31", month: 12, year: 2025 }, "2025년 12월 31일"],
  ] satisfies readonly (readonly [ChatMessageTimelineDate, string])[])(
    "KST 날짜 %o를 %s로 표시한다",
    (date, expected) => {
      expect(formatChatMessageDateSeparator(date, now)).toBe(expected);
    },
  );

  it("UTC 날짜가 달라도 Asia/Seoul 달력 날짜가 같으면 오늘로 표시한다", () => {
    expect(
      formatChatMessageDateSeparator(
        { day: 7, key: "2026-08-07", month: 8, year: 2026 },
        new Date("2026-08-06T15:00:00Z"),
      ),
    ).toBe("오늘");
  });
});

describe("ChatMessageDateSeparator", () => {
  it("가상 목록의 날짜 행을 접근 가능한 separator와 time 요소로 렌더링한다", () => {
    const html = renderToStaticMarkup(
      <ChatMessageDateSeparator
        date={{ day: 7, key: "2026-08-07", month: 8, year: 2026 }}
        now={new Date("2026-08-07T03:00:00Z")}
        renderKey="date-separator-2026-08-07"
        style={{ transform: "translateY(24px)" }}
        virtualIndex={2}
      />,
    );

    expect(html).toContain('role="separator"');
    expect(html).toContain('aria-label="오늘"');
    expect(html).toContain('data-date-key="2026-08-07"');
    expect(html).toContain('data-index="2"');
    expect(html).toContain('<time dateTime="2026-08-07">오늘</time>');
    expect(html).toContain("pb-[14px]");
  });
});
