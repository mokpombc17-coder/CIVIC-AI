import { describe, expect, it } from "vitest";
import { createChatMessageArrivalAnnouncement } from "./chat-message-arrival-announcement";
import type { ChatMessageItemViewModel } from "./chat-room-view-model";

describe("chat message arrival announcement", () => {
  it("새 메시지가 없으면 알림을 만들지 않는다", () => {
    expect(createChatMessageArrivalAnnouncement([])).toBeNull();
  });

  it("새 메시지 한 개는 발신자와 내용을 읽는다", () => {
    expect(
      createChatMessageArrivalAnnouncement([
        createMessage({
          content: "새로운 의견입니다.",
          senderLabel: "local-user-2",
        }),
      ]),
    ).toBe("local-user-2: 새로운 의견입니다.");
  });

  it("여러 메시지는 개수와 마지막 메시지를 요약한다", () => {
    expect(
      createChatMessageArrivalAnnouncement([
        createMessage({
          content: "첫 번째 메시지",
          senderLabel: "local-user-2",
        }),
        createMessage({
          content: "마지막 메시지",
          isMine: true,
          senderLabel: null,
        }),
      ]),
    ).toBe("새 메시지 2개가 도착했습니다. 마지막 메시지, 내 메시지: 마지막 메시지");
  });
});

function createMessage(
  overrides: Partial<ChatMessageItemViewModel> = {},
): ChatMessageItemViewModel {
  return {
    canMutate: false,
    clientMessageId: crypto.randomUUID(),
    content: "메시지",
    deliveryLabel: null,
    deliveryStatus: null,
    deliveryTone: null,
    isDeleted: false,
    isEdited: false,
    isMine: false,
    messageId: null,
    mutation: null,
    renderKey: crypto.randomUUID(),
    roomSequence: null,
    senderLabel: "local-user-1",
    timeLabel: "오후 3:00",
    ...overrides,
  };
}
