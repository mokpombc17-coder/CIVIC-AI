import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChatRoomView, type ChatMessageHistoryViewModel } from "./chat-room-view";

vi.mock("@/components/chat-message-viewport", () => ({
  ChatMessageViewport: ({ history }: { history: { readStatePaused: boolean } }) => (
    <div data-message-viewport="true" data-read-state-paused={history.readStatePaused} />
  ),
}));

vi.mock("@/components/use-chat-room-visual-viewport", () => ({
  useChatRoomVisualViewportHeight: () => ({ current: null }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/chat/room-01",
}));

describe("ChatRoomView platform shell integration", () => {
  it("공통 header, child-owned message viewport와 하단 내비게이션을 조립한다", () => {
    const markup = renderChatRoomView();

    expect(markup).toContain('data-platform-shell="true"');
    expect(markup.match(/data-scroll="child"/g)).toHaveLength(2);
    expect(markup).toContain('href="/chat"');
    expect(markup).toContain(">프로젝트 회의방</h1>");
    expect(markup).toContain('data-message-viewport="true"');
    expect(markup).toContain('data-read-state-paused="false"');
    expect(markup).toContain("세션 안내");
    expect(markup).toContain("메시지 입력");
    expect(markup).toContain('aria-label="참여자 주요 메뉴"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain("토론방");
  });

  it("overlay가 열리면 shell surface와 read-state를 함께 멈춘다", () => {
    const markup = renderChatRoomView(<div role="dialog">멤버십 대화상자</div>);

    expect(markup).toContain('data-platform-shell-overlay="true"');
    expect(markup).toContain('data-read-state-paused="true"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('inert=""');
    expect(markup).toContain("멤버십 대화상자");
  });

  it("검색 panel은 메시지 viewport와 하단 내비게이션을 유지하고 read-state를 멈추지 않는다", () => {
    const markup = renderChatRoomView(null, <section>메시지 검색 패널</section>);

    expect(markup).toContain("메시지 검색 패널");
    expect(markup).toContain('data-message-viewport="true"');
    expect(markup).toContain('data-read-state-paused="false"');
    expect(markup).toContain("메시지 입력");
    expect(markup).toContain('aria-label="참여자 주요 메뉴"');
    expect(markup).not.toContain('data-platform-shell-overlay="true"');
    expect(markup).not.toContain('inert=""');
  });
});

function renderChatRoomView(
  overlay: ReactNode = null,
  messageSearchPanel: ReactNode = null,
): string {
  return renderToStaticMarkup(
    <ChatRoomView
      header={{
        description: "참여자 3명",
        statusLabel: "연결됨",
        title: "프로젝트 회의방",
      }}
      headerAction={<button type="button">방 정보</button>}
      messageHistory={{} as ChatMessageHistoryViewModel}
      messageSearchPanel={messageSearchPanel}
      overlay={overlay}
      roomError={null}
      sessionControls={<div>메시지 입력</div>}
      sessionIndicator={<span>실시간 연결됨</span>}
      sessionNotice={<div>세션 안내</div>}
      syncStatus={null}
    />,
  );
}
