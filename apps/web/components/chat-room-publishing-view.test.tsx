import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChatMessageComposer } from "./chat-message-composer";
import { ChatMessageItem } from "./chat-message-item";
import { ChatRoomEntryError } from "./chat-room-entry-error";
import type { ChatMessageItemViewModel } from "./chat-room-view-model";

describe("chat room publishing view", () => {
  it("내 메시지를 Figma blue bubble과 우측 정렬된 displayName으로 표시하고 방장 badge는 숨긴다", () => {
    const html = renderMessage({ isMine: true, senderIsOwner: true, senderLabel: "noah111" });

    expect(html).toContain(">noah111</strong>");
    expect(html).not.toContain(">방장</span>");
    expect(html).toContain("bg-[var(--chat-publishing-color-primary)]");
    expect(html).toContain("rounded-br-[4px]");
    expect(html).toContain("flex items-center mb-0.5 min-h-5 justify-end");
    expect(html).toContain("오전 10:14");
  });

  it("다른 참여자가 방장이면 displayName 옆에 방장 badge를 표시한다", () => {
    const html = renderMessage({ isMine: false, senderIsOwner: true, senderLabel: "참여자 2" });

    expect(html).toContain(">참여자 2</strong>");
    expect(html).toContain(">방장</span>");
    expect(html).toContain("border-[#9ed1fa]");
    expect(html).toContain("bg-[#edf7ff]");
    expect(html).toContain("text-[#085985]");
  });

  it("다른 참여자는 profile label과 neutral bubble로 표시한다", () => {
    const html = renderMessage({ isMine: false, senderLabel: "참여자 2" });

    expect(html).toContain("참여자 2");
    expect(html).toContain("h-[29px]");
    expect(html).toContain("px-[6px]");
    expect(html).toContain("rounded-[var(--chat-publishing-radius-control)]");
    expect(html).toContain("bg-[var(--chat-publishing-color-accent-soft)]");
    expect(html).toContain("bg-[var(--chat-publishing-color-neutral-soft)]");
    expect(html).toContain("rounded-bl-[4px]");
    expect(html).toContain("flex items-center mb-1 min-h-[29px] justify-start");
  });

  it("말풍선은 metadata 너비와 무관하게 내용 너비를 따르되 메시지 영역의 82%를 넘지 않는다", () => {
    const mine = renderMessage({
      content: "네",
      isMine: true,
      senderLabel: "아주 긴 사용자 이름입니다",
    });
    const other = renderMessage({ content: "확인했습니다", isMine: false });

    expect(mine).toContain('data-message-bubble-container="true"');
    expect(mine).toContain("w-fit min-w-0 max-w-[82%]");
    expect(mine).toContain("w-fit min-w-0 max-w-full");
    expect(mine).toContain("inline-flex min-w-0 max-w-full");
    expect(mine).toContain("flex w-full min-w-0 items-end gap-1.5 flex-row-reverse justify-start");
    expect(other).toContain("flex w-full min-w-0 items-end gap-1.5 justify-start");
  });

  it("전송 시각과 안 읽은 수를 말풍선 옆의 보조 정보로 표시한다", () => {
    const html = renderMessage({ unreadCount: 1, unreadReceiptLabel: "1명 안 읽음" });

    expect(html).toContain('data-message-side-metadata="true"');
    expect(html).toContain('data-unread-count="1"');
    expect(html).toContain('aria-label="1명 안 읽음"');
    expect(html).toContain(">1</span>");
    expect(html).toContain("<time");
    expect(html).not.toContain(">1명 안 읽음</p>");
  });

  it("수정됨 상태를 괄호 없이 안 읽은 수와 시각 사이의 보조 정보로 표시한다", () => {
    const html = renderMessage({
      isEdited: true,
      unreadCount: 1,
      unreadReceiptLabel: "1명 안 읽음",
    });

    expect(html).toContain('data-message-side-metadata="true"');
    expect(html).toContain('data-message-edited="true"');
    expect(html).toContain("수정됨</span>");
    expect(html).not.toContain("(수정됨)");
    expect(html.indexOf('data-unread-count="1"')).toBeLessThan(
      html.indexOf('data-message-edited="true"'),
    );
    expect(html.indexOf('data-message-edited="true"')).toBeLessThan(html.indexOf("<time"));
  });

  it("개발 환경에서도 안 읽은 데이터가 없으면 안 읽은 수를 표시하지 않는다", () => {
    vi.stubEnv("NODE_ENV", "development");

    try {
      const html = renderMessage({
        isMine: true,
        unreadCount: null,
        unreadReceiptLabel: null,
      });

      expect(html).not.toContain("data-unread-count");
      expect(html).not.toContain("명 안 읽음");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("그룹 중간 메시지는 시각적 작성자·시간을 숨기고 접근 가능한 정보만 유지한다", () => {
    const html = renderMessage({
      endsSenderGroup: false,
      isMine: false,
      senderLabel: "참여자 2",
      startsSenderGroup: false,
    });

    expect(html).toContain('data-sender-group-start="false"');
    expect(html).toContain('data-message-metadata="accessible-only"');
    expect(html).toContain("참여자 2, 오전 10:14");
    expect(html).not.toContain('data-message-metadata="visible"');
    expect(html).not.toContain("<time");
  });

  it("그룹의 마지막 메시지에만 전송 시각을 표시한다", () => {
    const middle = renderMessage({ endsSenderGroup: false, startsSenderGroup: false });
    const end = renderMessage({ endsSenderGroup: true, startsSenderGroup: false });

    expect(middle).toContain('data-sender-group-end="false"');
    expect(middle).not.toContain("<time");
    expect(end).toContain('data-sender-group-end="true"');
    expect(end).toContain("<time");
    expect(end).toContain("오전 10:14");
  });

  it("검색으로 이동한 메시지를 현재 항목으로 표시하고 focus 대상으로 만든다", () => {
    const html = renderMessage({ messageId: "message-01" }, true);

    expect(html).toContain('aria-current="true"');
    expect(html).toContain('data-navigation-target="true"');
    expect(html).toContain('tabindex="-1"');
  });

  it("전송 중 상태를 확정 bubble 스타일과 동일하게 유지하고 지연 indicator로 표시한다", () => {
    const html = renderMessage({
      canOpenActions: false,
      deliveryLabel: "전송 중",
      deliveryStatus: "sending",
      deliveryTone: "pending",
      messageId: null,
    });

    expect(html).toContain("bg-[var(--chat-publishing-color-primary)]");
    expect(html).not.toContain("opacity-80");
    expect(html).toContain('data-delivery-indicator="pending"');
    expect(html).toContain("chat-message-delivery-pending");
    expect(html).toContain("absolute");
  });

  it("전송 실패 상태는 즉시 보이는 오류 indicator로 표시한다", () => {
    const html = renderMessage({
      canOpenActions: false,
      deliveryLabel: "메시지를 전송하지 못했습니다.",
      deliveryStatus: "failed",
      deliveryTone: "error",
      messageId: null,
    });

    expect(html).toContain('data-delivery-indicator="error"');
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("chat-message-delivery-pending");
  });

  it("composer를 72px 입력창과 48px 전송 control로 조립한다", () => {
    const html = renderToStaticMarkup(
      createElement(ChatMessageComposer, {
        canSend: true,
        disabled: false,
        draft: "",
        inputId: "message-input",
        onDraftChange: vi.fn(),
        onSubmit: vi.fn(),
        placeholder: "메시지를 입력하세요…",
        validationError: null,
      }),
    );

    expect(html).toContain("min-h-[72px]");
    expect(html).toContain('placeholder="메시지를 입력하세요…"');
    expect(html).toContain("h-12 w-16");
    expect(html).toContain(">전송</button>");
  });

  it("접근 종료 상태를 Figma warning card와 목록 action으로 표시한다", () => {
    const html = renderToStaticMarkup(
      createElement(ChatRoomEntryError, {
        error: {
          action: "return-to-list",
          detail: "방장에 의해 토론방에서 퇴장되었습니다.",
          onRetry: vi.fn(),
          title: "토론방에 참여할 수 없습니다.",
        },
      }),
    );

    expect(html).toContain("border-[#ffc95c]");
    expect(html).toContain("bg-[#fff7e8]");
    expect(html).toContain("min-h-[204px]");
    expect(html).toContain("pt-[18px] pb-[18px]");
    expect(html).toContain("mt-auto flex flex-wrap gap-2 pt-4");
    expect(html).toContain("h-12 min-w-[131px]");
    expect(html).toContain("토론방에 참여할 수 없습니다.");
    expect(html).toContain("방장에 의해 토론방에서 퇴장되었습니다.");
    expect(html).toContain('href="/chat"');
    expect(html).toContain(">토론방 목록</a>");
  });

  it("일시 조회 실패는 같은 공통 error card에서 재시도를 제공한다", () => {
    const html = renderToStaticMarkup(
      createElement(ChatRoomEntryError, {
        error: {
          action: "retry",
          detail: "네트워크 연결을 확인해 주세요.",
          onRetry: vi.fn(),
          title: "토론방 정보를 불러오지 못했습니다.",
        },
      }),
    );

    expect(html).toContain("토론방 정보를 불러오지 못했습니다.");
    expect(html).toContain(">다시 시도</button>");
    expect(html).not.toContain('href="/chat"');
  });
});

function renderMessage(
  patch: Partial<ChatMessageItemViewModel>,
  isNavigationTarget = false,
): string {
  const item: ChatMessageItemViewModel = {
    canOpenActions: true,
    canMutate: true,
    clientMessageId: "550e8400-e29b-41d4-a716-446655440000",
    content: "주거 지원 기준부터 이야기해볼까요?",
    deliveryLabel: null,
    deliveryStatus: null,
    deliveryTone: null,
    endsSenderGroup: true,
    isDeleted: false,
    isEdited: false,
    isMine: true,
    messageId: "message-01",
    mutation: null,
    unreadCount: null,
    unreadReceiptLabel: null,
    renderKey: "client-message-550e8400-e29b-41d4-a716-446655440000",
    roomSequence: 1,
    senderIsOwner: false,
    senderLabel: null,
    startsSenderGroup: true,
    timeLabel: "오전 10:14",
    ...patch,
  };

  return renderToStaticMarkup(
    createElement(ChatMessageItem, {
      isNavigationTarget,
      item,
      onOpenActions: vi.fn(),
      style: {},
      virtualIndex: 0,
    }),
  );
}
