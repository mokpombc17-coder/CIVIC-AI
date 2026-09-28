import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ChatRoomSessionView } from "@/lib/chat/realtime/chat-room-session-view";
import { ChatRoomSessionNotice } from "./chat-room-session-status";

describe("ChatRoomSessionNotice", () => {
  it("다른 탭 사용 상태를 정보성 안내와 재활성화 action으로 표시한다", () => {
    const html = renderToStaticMarkup(
      <ChatRoomSessionNotice
        onReactivate={vi.fn()}
        onReconnect={vi.fn()}
        onReload={vi.fn()}
        view={REPLACED_VIEW}
      />,
    );

    expect(html).toContain('data-chat-session-notice="replaced"');
    expect(html).toContain("다른 토론방에서 채팅 중이에요.");
    expect(html).toContain("이 토론방의 채팅은 잠시 대기 중이에요.");
    expect(html).toContain("이 토론방에서 계속하기");
    expect(html).toContain("bg-[var(--chat-publishing-color-accent-soft)]");
    expect(html).not.toContain("bg-red-50");
  });

  it("연결 오류를 주의 안내와 재연결 action으로 표시한다", () => {
    const html = renderToStaticMarkup(
      <ChatRoomSessionNotice
        onReactivate={vi.fn()}
        onReconnect={vi.fn()}
        onReload={vi.fn()}
        view={ERROR_VIEW}
      />,
    );

    expect(html).toContain('data-chat-session-notice="error"');
    expect(html).toContain("실시간 채팅 연결을 사용할 수 없습니다.");
    expect(html).toContain(">다시 연결</button>");
    expect(html).toContain("bg-[#fff7e8]");
    expect(html).not.toContain("border-red-200");
  });

  it("종료된 방을 오류가 아닌 정보성 안내로 표시한다", () => {
    const html = renderToStaticMarkup(
      <ChatRoomSessionNotice
        onReactivate={vi.fn()}
        onReconnect={vi.fn()}
        onReload={vi.fn()}
        view={CLOSED_VIEW}
      />,
    );

    expect(html).toContain('data-chat-session-notice="closed"');
    expect(html).toContain("종료된 토론방입니다.");
    expect(html).toContain("지난 대화 내역을 확인할 수 없습니다.");
    expect(html).toContain("bg-[var(--chat-publishing-color-accent-soft)]");
    expect(html).not.toContain(">다시 연결</button>");
  });

  it("안내가 필요 없는 활성 상태에서는 렌더링하지 않는다", () => {
    const html = renderToStaticMarkup(
      <ChatRoomSessionNotice
        onReactivate={vi.fn()}
        onReconnect={vi.fn()}
        onReload={vi.fn()}
        view={ACTIVE_VIEW}
      />,
    );

    expect(html).toBe("");
  });

  it("다른 브라우저나 기기에서 채팅 중이면 현재 화면에서 다시 시작할 수 있다", () => {
    const html = renderToStaticMarkup(
      <ChatRoomSessionNotice
        onReactivate={vi.fn()}
        onReconnect={vi.fn()}
        onReload={vi.fn()}
        view={CONNECTION_REPLACED_VIEW}
      />,
    );

    expect(html).toContain('data-chat-session-notice="connection-replaced"');
    expect(html).toContain("현재 채팅을 사용할 수 없습니다.");
    expect(html).toContain(
      "다른 기기나 창에서 채팅이 시작되었습니다. 여기서 다시 시작하면 다른 쪽 채팅은 중단됩니다.",
    );
    expect(html).toContain(">여기서 다시 시작하기</button>");
    expect(html).toContain("mb-3");
    expect(html).toContain("bg-[#fff7e8]");
  });
});

const REPLACED_VIEW = {
  canDraft: false,
  canReactivate: true,
  canReconnect: false,
  description: "이 토론방의 채팅은 잠시 대기 중이에요.",
  indicatorLabel: "다른 토론방 사용 중",
  indicatorTone: "pending",
  kind: "replaced",
  showNotice: true,
  title: "다른 토론방에서 채팅 중이에요.",
} satisfies ChatRoomSessionView;

const ERROR_VIEW = {
  canDraft: false,
  canReactivate: false,
  canReconnect: true,
  description: "다시 연결해 채팅을 복구해 주세요.",
  indicatorLabel: "채팅 불가",
  indicatorTone: "negative",
  kind: "error",
  showNotice: true,
  title: "실시간 채팅 연결을 사용할 수 없습니다.",
} satisfies ChatRoomSessionView;

const CONNECTION_REPLACED_VIEW = {
  canDraft: false,
  canReactivate: false,
  canReconnect: false,
  description:
    "다른 기기나 창에서 채팅이 시작되었습니다. 여기서 다시 시작하면 다른 쪽 채팅은 중단됩니다.",
  indicatorLabel: "다른 곳에서 사용 중",
  indicatorTone: "pending",
  kind: "connection-replaced",
  showNotice: true,
  title: "현재 채팅을 사용할 수 없습니다.",
} satisfies ChatRoomSessionView;

const CLOSED_VIEW = {
  canDraft: false,
  canReactivate: false,
  canReconnect: false,
  description: "종료된 토론방에서는 새 메시지를 보내거나 지난 대화 내역을 확인할 수 없습니다.",
  indicatorLabel: "종료됨",
  indicatorTone: "pending",
  kind: "closed",
  showNotice: true,
  title: "종료된 토론방입니다.",
} satisfies ChatRoomSessionView;

const ACTIVE_VIEW = {
  canDraft: true,
  canReactivate: false,
  canReconnect: false,
  description: "실시간 채팅을 사용 중입니다.",
  indicatorLabel: "채팅 가능",
  indicatorTone: "positive",
  kind: "active",
  showNotice: false,
  title: "이 토론방에서 실시간 채팅을 사용 중입니다.",
} satisfies ChatRoomSessionView;
