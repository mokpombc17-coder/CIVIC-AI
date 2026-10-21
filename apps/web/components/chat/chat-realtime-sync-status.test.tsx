import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChatRealtimeSyncStatus } from "./chat-realtime-sync-status";

describe("ChatRealtimeSyncStatus", () => {
  it("실시간 동기화 오류를 플랫폼 상태 카드와 재시도 action으로 표시한다", () => {
    const html = renderToStaticMarkup(
      <ChatRealtimeSyncStatus error={new Error("동기화 연결 실패")} onRetry={vi.fn()} visible />,
    );

    expect(html).toContain('data-chat-message-history-state="sync-error"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("실시간 메시지를 화면에 반영하지 못했습니다.");
    expect(html).toContain("메시지 다시 동기화");
    expect(html).toContain("bg-[#fff7e8]");
    expect(html).not.toContain("bg-red-50");
  });

  it("표시 대상이 아니거나 오류가 없으면 상태 카드를 렌더링하지 않는다", () => {
    const hiddenHtml = renderToStaticMarkup(
      <ChatRealtimeSyncStatus error={new Error("숨겨진 오류")} onRetry={vi.fn()} visible={false} />,
    );
    const idleHtml = renderToStaticMarkup(
      <ChatRealtimeSyncStatus error={null} onRetry={vi.fn()} visible />,
    );

    expect(hiddenHtml).toBe("");
    expect(idleHtml).toBe("");
  });
});
