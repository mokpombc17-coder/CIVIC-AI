import { describe, expect, it } from "vitest";
import {
  chatMessageSendRequestSchema,
  chatRoomSubscriptionSyncRequestSchema,
  parseChatMessageCommandResult,
  parseChatMessageCreatedEvent,
  parseChatRoomEventEnvelope,
  parseChatRoomSubscriptionSyncRejected,
  parseChatRoomSubscriptionsReady,
  parseChatSubscriptionRejection,
  parseChatSystemEvent,
} from "./chat-stomp-contracts";

const REQUEST_ID = "550e8400-e29b-41d4-a716-446655440000";
const CLIENT_MESSAGE_ID = "ed7d2fe8-996d-4660-822f-e84af1218743";

describe("chat STOMP outbound contracts", () => {
  it("구독 준비 sync 요청의 UUID를 검증한다", () => {
    expect(chatRoomSubscriptionSyncRequestSchema.parse({ requestId: REQUEST_ID })).toEqual({
      requestId: REQUEST_ID,
    });
    expect(
      chatRoomSubscriptionSyncRequestSchema.safeParse({ requestId: "not-a-uuid" }).success,
    ).toBe(false);
  });

  it("메시지 전송 요청의 UUID를 검증하고 strip된 content를 반환한다", () => {
    expect(
      chatMessageSendRequestSchema.parse({
        clientMessageId: CLIENT_MESSAGE_ID,
        content: " \t안녕하세요.\n반갑습니다. \r",
      }),
    ).toEqual({
      clientMessageId: CLIENT_MESSAGE_ID,
      content: "안녕하세요.\n반갑습니다.",
    });
    expect(
      chatMessageSendRequestSchema.safeParse({
        clientMessageId: CLIENT_MESSAGE_ID,
        content: "   ",
      }).success,
    ).toBe(false);
  });
});

describe("chat subscription sync contracts", () => {
  it("ROOM_SUBSCRIPTIONS_READY와 watermark를 검증한다", () => {
    const event = {
      status: "READY",
      eventType: "ROOM_SUBSCRIPTIONS_READY",
      requestId: REQUEST_ID,
      roomId: "room-01",
      messageVisibleAfterSequence: 100,
      watermarkSequence: 120,
    };

    expect(parseChatRoomSubscriptionsReady(JSON.stringify(event))).toEqual(event);
    expect(parseChatSystemEvent(JSON.stringify(event))).toEqual(event);
  });

  it("빈 방의 watermark 0을 허용하고 음수는 거절한다", () => {
    expect(
      parseChatRoomSubscriptionsReady(
        JSON.stringify({
          status: "READY",
          eventType: "ROOM_SUBSCRIPTIONS_READY",
          requestId: REQUEST_ID,
          roomId: "room-01",
          messageVisibleAfterSequence: 0,
          watermarkSequence: 0,
        }),
      ),
    ).not.toBeNull();
    expect(
      parseChatRoomSubscriptionsReady(
        JSON.stringify({
          status: "READY",
          eventType: "ROOM_SUBSCRIPTIONS_READY",
          requestId: REQUEST_ID,
          roomId: "room-01",
          messageVisibleAfterSequence: 0,
          watermarkSequence: -1,
        }),
      ),
    ).toBeNull();
    expect(
      parseChatRoomSubscriptionsReady(
        JSON.stringify({
          status: "READY",
          eventType: "ROOM_SUBSCRIPTIONS_READY",
          requestId: REQUEST_ID,
          roomId: "room-01",
          messageVisibleAfterSequence: -1,
          watermarkSequence: 0,
        }),
      ),
    ).toBeNull();
  });

  it("sync 거절 code와 retryable 조합을 검증한다", () => {
    const retryableEvent = {
      status: "REJECTED",
      eventType: "ROOM_SUBSCRIPTION_SYNC_REJECTED",
      requestId: REQUEST_ID,
      roomId: "room-01",
      code: "ROOM_AUTHORIZATION_UNAVAILABLE",
      retryable: true,
    };

    expect(parseChatRoomSubscriptionSyncRejected(JSON.stringify(retryableEvent))).toEqual(
      retryableEvent,
    );
    expect(
      parseChatRoomSubscriptionSyncRejected(
        JSON.stringify({
          ...retryableEvent,
          retryable: false,
        }),
      ),
    ).toBeNull();

    const staleEvent = {
      ...retryableEvent,
      code: "ROOM_SUBSCRIPTION_STALE",
      retryable: false,
    };
    expect(parseChatRoomSubscriptionSyncRejected(JSON.stringify(staleEvent))).toEqual(staleEvent);
  });

  it("기존 topic 구독 거절을 sync 거절과 구분한다", () => {
    const event = {
      status: "REJECTED",
      code: "ACTIVE_ROOM_LIMIT_EXCEEDED",
      destination: "/topic/rooms/room-01/messages",
    };

    expect(parseChatSubscriptionRejection(JSON.stringify(event))).toEqual(event);
    expect(
      parseChatSubscriptionRejection(
        JSON.stringify({
          status: "REJECTED",
          eventType: "ROOM_SUBSCRIPTION_SYNC_REJECTED",
          requestId: REQUEST_ID,
          roomId: "room-01",
          code: "ROOM_SUBSCRIPTIONS_NOT_READY",
          retryable: false,
        }),
      ),
    ).toBeNull();
  });
});

describe("chat realtime payload contracts", () => {
  it("CHAT_MESSAGE_CREATED payload를 REST ChatMessage 계약으로 검증한다", () => {
    const event = {
      eventVersion: 1,
      eventType: "CHAT_MESSAGE_CREATED",
      payload: {
        messageId: "message-01",
        roomId: "room-01",
        roomSequence: 1,
        senderUserId: "local-user-1",
        clientMessageId: CLIENT_MESSAGE_ID,
        content: "안녕하세요.",
        createdAt: "2026-07-29T04:40:00Z",
      },
    };

    expect(parseChatMessageCreatedEvent(JSON.stringify(event))).toEqual(event);
  });

  it("메시지 command 성공과 실패 결과를 구분해 검증한다", () => {
    const accepted = {
      clientMessageId: CLIENT_MESSAGE_ID,
      status: "ACCEPTED",
      code: null,
      retryable: false,
      retryAfterMs: null,
      messageId: "message-01",
      roomSequence: 1,
    };
    const failed = {
      clientMessageId: CLIENT_MESSAGE_ID,
      status: "FAILED",
      code: "PERSISTENCE_FAILED",
      retryable: true,
      retryAfterMs: 1_000,
      messageId: null,
      roomSequence: null,
    };

    expect(parseChatMessageCommandResult(JSON.stringify(accepted))).toEqual(accepted);
    expect(parseChatMessageCommandResult(JSON.stringify(failed))).toEqual(failed);
    expect(
      parseChatMessageCommandResult(
        JSON.stringify({
          ...accepted,
          messageId: null,
        }),
      ),
    ).toBeNull();
  });

  it("멤버 상태를 포함한 Room Event를 검증한다", () => {
    const event = createRoomEvent("ROOM_MEMBER_JOINED", {
      member: createMemberState("membership-02", "local-user-2", "MEMBER"),
    });

    expect(parseChatRoomEventEnvelope(JSON.stringify(event))).toEqual(event);
    expect(parseChatSystemEvent(JSON.stringify(event))).toEqual(event);
  });

  it("방장 위임 Room Event의 양쪽 사용자 상태를 검증한다", () => {
    const event = createRoomEvent("ROOM_OWNERSHIP_TRANSFERRED", {
      previousOwner: createMemberState("membership-01", "local-user-1", "MEMBER"),
      newOwner: createMemberState("membership-02", "local-user-2", "OWNER"),
    });

    expect(parseChatRoomEventEnvelope(JSON.stringify(event))).toEqual(event);
  });

  it("Room Event 상태 객체에 userId가 없으면 거절한다", () => {
    const member = createMemberState("membership-02", "local-user-2", "MEMBER");
    const memberWithoutUserId: Partial<typeof member> = { ...member };
    delete memberWithoutUserId.userId;
    const event = createRoomEvent("ROOM_MEMBER_JOINED", {
      member: memberWithoutUserId,
    });

    expect(parseChatRoomEventEnvelope(JSON.stringify(event))).toBeNull();
  });

  it("잘못된 JSON과 알려지지 않은 system event를 무시한다", () => {
    expect(parseChatSystemEvent("{")).toBeNull();
    expect(parseChatSystemEvent(JSON.stringify({ eventType: "UNKNOWN" }))).toBeNull();
  });
});

function createRoomEvent(eventType: string, state: Record<string, unknown>) {
  return {
    eventVersion: 1,
    eventId: "event-01",
    eventType,
    emittedAt: "2026-07-29T04:41:00Z",
    payload: {
      roomId: "room-01",
      roomVersion: 2,
      roomStatus: "ACTIVE",
      ...state,
    },
  };
}

function createMemberState(membershipId: string, userId: string, role: "OWNER" | "MEMBER") {
  return {
    membershipId,
    userId,
    role,
    status: "ACTIVE",
    membershipVersion: 1,
  };
}
