import { describe, expect, it } from "vitest";
import { createChatMessageTimeline } from "./chat-message-timeline";
import type { ChatMessage } from "./chat-room-contracts";
import type { ChatOutgoingMessage } from "./realtime/chat-message-outbox";

const CLIENT_MESSAGE_ID = "550e8400-e29b-41d4-a716-446655440000";

describe("createChatMessageTimeline", () => {
  it("확정 메시지 뒤에 optimistic 메시지를 전송 요청 순서대로 표시한다", () => {
    const timeline = createChatMessageTimeline(
      [createConfirmed("server-id")],
      [createOutgoing(CLIENT_MESSAGE_ID, "queued")],
    );

    expect(timeline.map(({ kind }) => kind)).toEqual(["confirmed", "outgoing"]);
  });

  it("같은 clientMessageId가 서버 이력에 나타나면 optimistic 항목을 제거한다", () => {
    const timeline = createChatMessageTimeline(
      [createConfirmed(CLIENT_MESSAGE_ID)],
      [createOutgoing(CLIENT_MESSAGE_ID, "accepted")],
    );

    expect(timeline).toHaveLength(1);
    expect(timeline[0]?.kind).toBe("confirmed");
  });
});

function createConfirmed(clientMessageId: string): ChatMessage {
  return {
    messageId: "message-01",
    roomId: "room-01",
    roomSequence: 1,
    countable: true,
    senderUserId: "local-user-1",
    clientMessageId,
    content: "확정 메시지",
    createdAt: "2026-07-31T00:00:00Z",
    deletedAt: null,
    messageVersion: 1,
    state: "ACTIVE",
    updatedAt: "2026-07-31T00:00:00Z",
  };
}

function createOutgoing(
  clientMessageId: string,
  status: ChatOutgoingMessage["status"],
): ChatOutgoingMessage {
  return {
    attempt: status === "queued" ? 0 : 1,
    clientMessageId,
    content: "optimistic 메시지",
    enqueuedAt: 1_000,
    generation: 3,
    message: null,
    retryAt: null,
    roomId: "room-01",
    status,
  };
}
