import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/lib/chat/chat-room-contracts";
import type { ChatRoomReadReceiptState } from "@/lib/chat/chat-room-read-receipt-state";
import type { ChatRoomReadReceiptSyncStatus } from "@/lib/chat/realtime/chat-room-read-receipt-coordinator";
import { createChatMessageReadReceiptPresentation } from "./chat-message-read-receipt-presentation";

const MESSAGE: ChatMessage = {
  clientMessageId: "550e8400-e29b-41d4-a716-446655440010",
  content: "Read Receipt 통합 테스트",
  countable: true,
  createdAt: "2026-08-10T03:00:00Z",
  deletedAt: null,
  messageId: "message-10",
  messageVersion: 1,
  roomId: "room-01",
  roomSequence: 10,
  senderMembershipId: "membership-a",
  state: "ACTIVE",
  updatedAt: "2026-08-10T03:00:00Z",
};

const RECEIPT_STATE: ChatRoomReadReceiptState = {
  generatedAt: "2026-08-10T03:00:01Z",
  positionsByMembershipId: {
    "membership-a": {
      membershipId: "membership-a",
      membershipVersion: 1,
      messageVisibleAfterSequence: 0,
      storedLastReadSequence: 10,
    },
    "membership-b": {
      membershipId: "membership-b",
      membershipVersion: 1,
      messageVisibleAfterSequence: 0,
      storedLastReadSequence: 0,
    },
  },
  roomId: "room-01",
  roomVersion: 2,
  selfMembershipId: "membership-a",
};

describe("chat message Read Receipt presentation", () => {
  it.each<ChatRoomReadReceiptSyncStatus>(["idle", "loading", "refreshing", "error", "terminal"])(
    "%s 상태에서는 stale count를 표시하지 않는다",
    (receiptSyncStatus) => {
      const presentation = createChatMessageReadReceiptPresentation({
        messages: [MESSAGE],
        receiptState: RECEIPT_STATE,
        receiptSyncStatus,
        selfMembershipId: "membership-a",
      });

      expect(presentation.membershipMismatch).toBe(false);
      expect(presentation.summaries.size).toBe(0);
    },
  );

  it("Room detail과 Receipt snapshot의 self Membership이 다르면 count를 숨긴다", () => {
    const presentation = createChatMessageReadReceiptPresentation({
      messages: [MESSAGE],
      receiptState: RECEIPT_STATE,
      receiptSyncStatus: "ready",
      selfMembershipId: "membership-other",
    });

    expect(presentation.membershipMismatch).toBe(true);
    expect(presentation.summaries.size).toBe(0);
  });

  it("ready 상태에서 delta로 전진한 stored cursor를 즉시 새 count로 projection한다", () => {
    const before = createChatMessageReadReceiptPresentation({
      messages: [MESSAGE],
      receiptState: RECEIPT_STATE,
      receiptSyncStatus: "ready",
      selfMembershipId: "membership-a",
    });
    const after = createChatMessageReadReceiptPresentation({
      messages: [MESSAGE],
      receiptState: {
        ...RECEIPT_STATE,
        positionsByMembershipId: {
          ...RECEIPT_STATE.positionsByMembershipId,
          "membership-b": {
            ...RECEIPT_STATE.positionsByMembershipId["membership-b"]!,
            storedLastReadSequence: 10,
          },
        },
      },
      receiptSyncStatus: "ready",
      selfMembershipId: "membership-a",
    });

    expect(before.summaries.get(MESSAGE.messageId)?.readCount).toBe(0);
    expect(after.summaries.get(MESSAGE.messageId)?.readCount).toBe(1);
  });
});
