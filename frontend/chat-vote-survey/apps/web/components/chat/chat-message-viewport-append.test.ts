import { describe, expect, it } from "vitest";
import {
  createChatMessageViewportItemsSnapshot,
  detectChatMessageViewportAppend,
} from "./chat-message-viewport-append";
import type {
  ChatMessageItemViewModel,
  ChatMessageViewportItemViewModel,
} from "./chat-room-view-model";

describe("chat message viewport append", () => {
  it("마지막 항목의 render key와 문맥 key로 snapshot을 만든다", () => {
    expect(
      createChatMessageViewportItemsSnapshot([message("m-01"), message("m-02")], "live"),
    ).toEqual({
      lastRenderKey: "m-02",
      viewportContinuityKey: "live",
    });
    expect(createChatMessageViewportItemsSnapshot([], "live")).toEqual({
      lastRenderKey: null,
      viewportContinuityKey: "live",
    });
  });

  it("이전 snapshot이 없거나 문맥 key가 바뀌면 새 viewport로 보고 추가 항목을 세지 않는다", () => {
    const items = [message("m-01"), message("m-02")];

    expect(
      detectChatMessageViewportAppend({ items, previous: null, viewportContinuityKey: "live" }),
    ).toEqual({
      appendedMessages: [],
      hasAppendedSystemActivity: false,
      isNewViewport: true,
      source: "realtime",
    });
    expect(
      detectChatMessageViewportAppend({
        items,
        previous: { lastRenderKey: "m-01", viewportContinuityKey: "context" },
        viewportContinuityKey: "live",
      }),
    ).toMatchObject({
      appendedMessages: [],
      isNewViewport: true,
    });
  });

  it("이전 마지막 항목 뒤에 붙은 메시지를 실시간 추가로 감지한다", () => {
    const result = detectChatMessageViewportAppend({
      items: [message("m-01"), dateSeparator("date-02"), message("m-02"), message("m-03")],
      previous: { lastRenderKey: "m-01", viewportContinuityKey: "live" },
      viewportContinuityKey: "live",
    });

    expect(result.isNewViewport).toBe(false);
    expect(result.appendedMessages.map((item) => item.renderKey)).toEqual(["m-02", "m-03"]);
    expect(result.hasAppendedSystemActivity).toBe(false);
    expect(result.source).toBe("realtime");
  });

  it("전송 상태가 있는 내 메시지가 붙으면 현재 사용자 추가로 판단한다", () => {
    const previous = { lastRenderKey: "m-01", viewportContinuityKey: "live" };

    expect(
      detectChatMessageViewportAppend({
        items: [message("m-01"), message("m-02", { deliveryTone: "pending", isMine: true })],
        previous,
        viewportContinuityKey: "live",
      }).source,
    ).toBe("current-user");
    expect(
      detectChatMessageViewportAppend({
        items: [message("m-01"), message("m-02", { isMine: true })],
        previous,
        viewportContinuityKey: "live",
      }).source,
    ).toBe("realtime");
  });

  it("시스템 활동만 붙으면 메시지 없이 시스템 활동 추가로 표시한다", () => {
    const result = detectChatMessageViewportAppend({
      items: [message("m-01"), systemActivity("activity-01")],
      previous: { lastRenderKey: "m-01", viewportContinuityKey: "live" },
      viewportContinuityKey: "live",
    });

    expect(result.appendedMessages).toEqual([]);
    expect(result.hasAppendedSystemActivity).toBe(true);
  });

  it("앞쪽에 붙은 과거 이력과 변화 없는 목록은 추가로 보지 않는다", () => {
    const previous = { lastRenderKey: "m-02", viewportContinuityKey: "live" };

    expect(
      detectChatMessageViewportAppend({
        items: [message("m-00"), message("m-01"), message("m-02")],
        previous,
        viewportContinuityKey: "live",
      }).appendedMessages,
    ).toEqual([]);
    expect(
      detectChatMessageViewportAppend({
        items: [message("m-01"), message("m-02")],
        previous,
        viewportContinuityKey: "live",
      }).appendedMessages,
    ).toEqual([]);
  });

  it("이전 마지막 항목이 목록에서 사라지면 추가 항목을 세지 않는다", () => {
    expect(
      detectChatMessageViewportAppend({
        items: [message("m-01"), message("m-03")],
        previous: { lastRenderKey: "m-02", viewportContinuityKey: "live" },
        viewportContinuityKey: "live",
      }).appendedMessages,
    ).toEqual([]);
    expect(
      detectChatMessageViewportAppend({
        items: [message("m-01")],
        previous: { lastRenderKey: null, viewportContinuityKey: "live" },
        viewportContinuityKey: "live",
      }).appendedMessages,
    ).toEqual([]);
  });
});

function message(
  renderKey: string,
  overrides: Partial<ChatMessageItemViewModel> = {},
): ChatMessageViewportItemViewModel {
  return {
    item: {
      canMutate: false,
      canOpenActions: false,
      clientMessageId: renderKey,
      content: renderKey,
      deliveryLabel: null,
      deliveryStatus: null,
      deliveryTone: null,
      endsSenderGroup: true,
      isDeleted: false,
      isEdited: false,
      isMine: false,
      messageId: renderKey,
      mutation: null,
      renderKey,
      roomSequence: null,
      senderIsOwner: false,
      senderLabel: null,
      startsSenderGroup: true,
      timeLabel: "오후 3:00",
      unreadCount: null,
      unreadReceiptLabel: null,
      ...overrides,
    },
    kind: "message",
    renderKey,
  };
}

function dateSeparator(renderKey: string): ChatMessageViewportItemViewModel {
  return {
    date: { day: 22, key: "2026-10-22", month: 10, year: 2026 },
    kind: "date-separator",
    renderKey,
  };
}

function systemActivity(renderKey: string): ChatMessageViewportItemViewModel {
  return {
    kind: "system-activity",
    message: "참여자가 입장했습니다.",
    renderKey,
  };
}
