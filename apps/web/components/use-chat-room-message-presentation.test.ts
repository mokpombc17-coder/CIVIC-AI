import { describe, expect, it } from "vitest";
import type { ChatMessage, RoomMembershipListItem } from "@/lib/chat/chat-room-contracts";
import type { ChatOutgoingMessage } from "@/lib/chat/realtime/chat-message-outbox";
import { createChatRoomMessagePresentation } from "./use-chat-room-message-presentation";

describe("chat room message presentation", () => {
  it("메시지 원천을 viewport row와 퍼블리싱용 작성자·읽음 상태로 조립한다", () => {
    const presentation = createChatRoomMessagePresentation({
      confirmedMessages: [MESSAGE],
      mutationStates: new Map(),
      outgoingMessages: [OUTGOING_MESSAGE],
      participantProfiles: [PARTICIPANT],
      readBoundaryAfterSequence: 1,
      receiptState: {
        generatedAt: "2026-08-10T03:00:00Z",
        positionsByMembershipId: {
          "membership-01": {
            membershipId: "membership-01",
            membershipVersion: 1,
            messageVisibleAfterSequence: 0,
            storedLastReadSequence: 2,
          },
          "membership-02": {
            membershipId: "membership-02",
            membershipVersion: 1,
            messageVisibleAfterSequence: 0,
            storedLastReadSequence: 2,
          },
        },
        roomId: "room-01",
        roomVersion: 2,
        selfMembershipId: "membership-01",
      },
      receiptSyncStatus: "ready",
      selfMembershipId: "membership-01",
    });

    expect(presentation.viewportItems.map((item) => item.kind)).toEqual([
      "date-separator",
      "read-boundary",
      "message",
      "message",
    ]);
    expect(presentation.messageItems[0]).toMatchObject({
      isMine: false,
      readCount: 1,
      readReceiptLabel: "1명 읽음",
      senderLabel: "참여자 2",
    });
    expect(presentation.messageItems[1]).toMatchObject({
      deliveryStatus: "queued",
      isMine: true,
      readReceiptLabel: null,
    });
    expect(presentation.participantDisplayNames.get("membership-02")).toBe("참여자 2");
    expect(presentation.receiptMembershipMismatch).toBe(false);
  });

  it("receipt self membership가 다르면 읽음 표시를 숨기고 mismatch를 노출한다", () => {
    const presentation = createChatRoomMessagePresentation({
      confirmedMessages: [MESSAGE],
      mutationStates: new Map(),
      outgoingMessages: [],
      participantProfiles: [PARTICIPANT],
      readBoundaryAfterSequence: null,
      receiptState: {
        generatedAt: "2026-08-10T03:00:00Z",
        positionsByMembershipId: {},
        roomId: "room-01",
        roomVersion: 2,
        selfMembershipId: "membership-stale",
      },
      receiptSyncStatus: "ready",
      selfMembershipId: "membership-01",
    });

    expect(presentation.receiptMembershipMismatch).toBe(true);
    expect(presentation.messageItems[0]).toMatchObject({
      readCount: null,
      readReceiptLabel: null,
    });
  });
});

const MESSAGE = {
  clientMessageId: "550e8400-e29b-41d4-a716-446655440001",
  content: "확정 메시지",
  countable: true,
  createdAt: "2026-08-10T03:00:00Z",
  deletedAt: null,
  messageId: "message-01",
  messageVersion: 1,
  roomId: "room-01",
  roomSequence: 2,
  senderMembershipId: "membership-02",
  state: "ACTIVE",
  updatedAt: "2026-08-10T03:00:00Z",
} satisfies ChatMessage;

const OUTGOING_MESSAGE = {
  attempt: 0,
  clientMessageId: "550e8400-e29b-41d4-a716-446655440002",
  content: "전송 대기 메시지",
  enqueuedAt: Date.parse("2026-08-10T03:01:00Z"),
  generation: 1,
  message: null,
  retryAt: null,
  roomId: "room-01",
  status: "queued",
} satisfies ChatOutgoingMessage;

const PARTICIPANT = {
  bannedAt: null,
  displayName: "참여자 2",
  imageUrl: null,
  joinedAt: "2026-08-10T03:00:00Z",
  leftAt: null,
  membershipId: "membership-02",
  profileVersion: 1,
  role: "MEMBER",
  status: "ACTIVE",
  version: 1,
} satisfies RoomMembershipListItem;
