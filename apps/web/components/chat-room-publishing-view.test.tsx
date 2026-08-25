import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChatMessageComposer } from "./chat-message-composer";
import { ChatMessageItem } from "./chat-message-item";
import type { ChatMessageItemViewModel } from "./chat-room-view-model";

describe("chat room publishing view", () => {
  it("내 메시지를 Figma blue bubble과 나 label로 표시한다", () => {
    const html = renderMessage({ isMine: true, senderLabel: null });

    expect(html).toContain(">나</span>");
    expect(html).toContain("bg-[var(--chat-publishing-color-primary)]");
    expect(html).toContain("rounded-br-[4px]");
    expect(html).toContain("오전 10:14");
  });

  it("다른 참여자는 profile label과 neutral bubble로 표시한다", () => {
    const html = renderMessage({ isMine: false, senderLabel: "참여자 2" });

    expect(html).toContain("참여자 2");
    expect(html).toContain("bg-[var(--chat-publishing-color-accent-soft)]");
    expect(html).toContain("bg-[var(--chat-publishing-color-neutral-soft)]");
    expect(html).toContain("rounded-bl-[4px]");
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
});

function renderMessage(patch: Partial<ChatMessageItemViewModel>): string {
  const item: ChatMessageItemViewModel = {
    canOpenActions: true,
    canMutate: true,
    clientMessageId: "550e8400-e29b-41d4-a716-446655440000",
    content: "주거 지원 기준부터 이야기해볼까요?",
    deliveryLabel: null,
    deliveryStatus: null,
    deliveryTone: null,
    isDeleted: false,
    isEdited: false,
    isMine: true,
    messageId: "message-01",
    mutation: null,
    readCount: null,
    readReceiptLabel: null,
    renderKey: "client-message-550e8400-e29b-41d4-a716-446655440000",
    roomSequence: 1,
    senderLabel: null,
    timeLabel: "오전 10:14",
    ...patch,
  };

  return renderToStaticMarkup(
    createElement(ChatMessageItem, {
      item,
      onOpenActions: vi.fn(),
      style: {},
      virtualIndex: 0,
    }),
  );
}
