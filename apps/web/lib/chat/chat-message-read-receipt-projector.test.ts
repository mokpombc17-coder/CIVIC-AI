import { describe, expect, it } from "vitest";
import type { ChatMessage, RoomReadReceiptPosition } from "./chat-room-contracts";
import {
  projectChatMessageReadReceipts,
  projectMessageReadReceipt,
} from "./chat-message-read-receipt-projector";

const ACTIVE_MESSAGE: ChatMessage = {
  clientMessageId: "550e8400-e29b-41d4-a716-446655440120",
  content: "읽음 집계 메시지",
  countable: true,
  createdAt: "2026-08-10T03:00:00Z",
  deletedAt: null,
  messageId: "message-120",
  messageVersion: 1,
  roomId: "room-01",
  roomSequence: 120,
  senderMembershipId: "membership-a",
  state: "ACTIVE",
  updatedAt: "2026-08-10T03:00:00Z",
};

function createPosition(
  membershipId: string,
  messageVisibleAfterSequence: number,
  storedLastReadSequence: number,
): RoomReadReceiptPosition {
  return {
    membershipId,
    membershipVersion: 1,
    messageVisibleAfterSequence,
    storedLastReadSequence,
  };
}

describe("chat message Read Receipt projector", () => {
  it("작성자를 제외하고 참여 경계와 stored cursor로 읽은 인원을 집계한다", () => {
    expect(
      projectMessageReadReceipt(ACTIVE_MESSAGE, [
        createPosition("membership-a", 0, 130),
        createPosition("membership-b", 0, 130),
        createPosition("membership-c", 100, 110),
        createPosition("membership-d", 125, 130),
      ]),
    ).toEqual({
      eligibleRecipientCount: 2,
      readCount: 1,
      unreadCount: 1,
      allRead: false,
    });
  });

  it("eligible 참여자가 없으면 allRead를 false로 유지한다", () => {
    expect(
      projectMessageReadReceipt(ACTIVE_MESSAGE, [
        createPosition("membership-a", 0, 130),
        createPosition("membership-b", 120, 130),
      ]),
    ).toEqual({
      eligibleRecipientCount: 0,
      readCount: 0,
      unreadCount: 0,
      allRead: false,
    });
  });

  it("모든 eligible 참여자가 읽으면 allRead를 true로 계산한다", () => {
    expect(
      projectMessageReadReceipt(ACTIVE_MESSAGE, [
        createPosition("membership-b", 0, 120),
        createPosition("membership-c", 100, 140),
      ]),
    ).toMatchObject({
      eligibleRecipientCount: 2,
      readCount: 2,
      unreadCount: 0,
      allRead: true,
    });
  });

  it("삭제된 메시지는 여러 메시지 projection에서 제외한다", () => {
    const deletedMessage: ChatMessage = {
      ...ACTIVE_MESSAGE,
      content: null,
      deletedAt: "2026-08-10T03:01:00Z",
      messageId: "message-deleted",
      messageVersion: 2,
      state: "DELETED_BY_AUTHOR",
      updatedAt: "2026-08-10T03:01:00Z",
    };

    const summaries = projectChatMessageReadReceipts([ACTIVE_MESSAGE, deletedMessage], {
      "membership-b": createPosition("membership-b", 0, 130),
    });

    expect(summaries.get(ACTIVE_MESSAGE.messageId)?.readCount).toBe(1);
    expect(summaries.has(deletedMessage.messageId)).toBe(false);
  });
});
