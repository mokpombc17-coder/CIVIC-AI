import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  ChatMessageViewportArrivalAnnouncement,
  ChatMessageViewportHistoryError,
  ChatMessageViewportHistoryNotice,
  ChatMessageViewportNewMessagesButton,
  ChatMessageViewportOlderHistoryStatus,
  ChatMessageViewportVirtualRow,
} from "./chat-message-viewport-presentation";

describe("ChatMessageViewport presentation", () => {
  it("이전 이력 loading과 error 상태를 각각 렌더링한다", () => {
    const loadingMarkup = renderToStaticMarkup(
      <ChatMessageViewportOlderHistoryStatus error={null} isLoading onRetry={vi.fn()} />,
    );
    const errorMarkup = renderToStaticMarkup(
      <ChatMessageViewportOlderHistoryStatus
        error="이전 이력을 불러오지 못했습니다."
        isLoading={false}
        onRetry={vi.fn()}
      />,
    );

    expect(loadingMarkup).toContain('role="status"');
    expect(loadingMarkup).toContain("이전 메시지를 불러오는 중…");
    expect(errorMarkup).toContain('role="alert"');
    expect(errorMarkup).toContain("이전 메시지 다시 불러오기");
  });

  it("메시지 이력 notice와 error의 접근성 상태를 유지한다", () => {
    const noticeMarkup = renderToStaticMarkup(
      <ChatMessageViewportHistoryNotice message="아직 작성된 메시지가 없습니다." />,
    );
    const errorMarkup = renderToStaticMarkup(
      <ChatMessageViewportHistoryError
        message="네트워크 오류"
        onRetry={vi.fn()}
        title="메시지 이력을 불러오지 못했습니다."
      />,
    );

    expect(noticeMarkup).toContain("아직 작성된 메시지가 없습니다.");
    expect(errorMarkup).toContain('role="alert"');
    expect(errorMarkup).toContain("다시 불러오기");
  });

  it("새 메시지 수와 도착 안내를 별도 표현 요소로 렌더링한다", () => {
    const buttonMarkup = renderToStaticMarkup(
      <ChatMessageViewportNewMessagesButton count={3} onJumpToLatest={vi.fn()} />,
    );
    const announcementMarkup = renderToStaticMarkup(
      <ChatMessageViewportArrivalAnnouncement
        announcement={{ id: 1, message: "새 메시지가 도착했습니다." }}
      />,
    );

    expect(buttonMarkup).toContain("새 메시지 3개");
    expect(buttonMarkup).toContain("최신 메시지로 이동");
    expect(announcementMarkup).toContain('aria-live="polite"');
    expect(announcementMarkup).toContain("새 메시지가 도착했습니다.");
  });

  it("가상 row의 위치와 읽음 구분선 DOM 계약을 유지한다", () => {
    const markup = renderToStaticMarkup(
      <ChatMessageViewportVirtualRow
        item={{
          afterSequence: 12,
          kind: "read-boundary",
          renderKey: "read-boundary-12",
        }}
        measureElement={() => undefined}
        onOpenMessageActions={vi.fn()}
        start={128}
        virtualIndex={4}
      />,
    );

    expect(markup).toContain('data-index="4"');
    expect(markup).toContain('data-render-key="read-boundary-12"');
    expect(markup).toContain('data-read-boundary-after-sequence="12"');
    expect(markup).toContain("translateY(128px)");
  });
});
