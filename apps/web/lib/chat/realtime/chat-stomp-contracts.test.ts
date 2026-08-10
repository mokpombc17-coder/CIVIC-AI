import { describe, expect, it } from "vitest";
import {
  chatMessageDeleteRequestSchema,
  chatMessageEditRequestSchema,
  chatMessageSendRequestSchema,
  chatRoomSubscriptionSyncRequestSchema,
  parseChatMessageCommandResult,
  parseChatMessageEvent,
  parseChatMessageMutationCommandResult,
  parseChatRoomEventEnvelope,
  parseChatRoomInboxEvent,
  parseChatRoomSubscriptionSyncRejected,
  parseChatRoomSubscriptionsReady,
  parseChatStompError,
  parseChatSubscriptionRejection,
  parseChatSystemEvent,
} from "./chat-stomp-contracts";

const REQUEST_ID = "550e8400-e29b-41d4-a716-446655440000";
const CLIENT_MESSAGE_ID = "ed7d2fe8-996d-4660-822f-e84af1218743";

const ROOM_INBOX_CREATED_EVENT = {
  eventVersion: 2,
  eventId: REQUEST_ID,
  eventType: "ROOM_INBOX_INVALIDATED",
  cause: "MESSAGE_CREATED",
  roomId: "room-01",
  roomNameHint: "토론방",
  emittedAt: "2026-08-04T01:10:00Z",
  sourceEventIds: ["chat-message-created:message-84"],
  coalescedCreateCount: 1,
  notificationHint: {
    messageId: "message-84",
    messageVersion: 1,
    senderMembershipId: "membership-02",
    messageCreatedAt: "2026-08-04T01:09:59Z",
    preview: "다음 회의는 월요일입니다.",
    previewTruncated: false,
  },
} as const;

describe("chat STOMP ERROR contract", () => {
  it("구조화된 인증 실패 ERROR frame을 파싱한다", () => {
    expect(
      parseChatStompError({
        headers: {
          message: "AUTHENTICATION_REQUIRED",
          "content-type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
          code: "AUTHENTICATION_REQUIRED",
          retryable: false,
        }),
      }),
    ).toEqual({
      code: "AUTHENTICATION_REQUIRED",
      retryable: false,
    });
  });

  it("헤더와 body가 인증 실패 계약에 모두 일치하지 않으면 거절한다", () => {
    const body = JSON.stringify({
      code: "AUTHENTICATION_REQUIRED",
      retryable: false,
    });

    expect(
      parseChatStompError({
        headers: { message: "AUTHENTICATION_REQUIRED", "content-type": "text/plain" },
        body,
      }),
    ).toBeNull();
    expect(
      parseChatStompError({
        headers: { message: "SERVER_ERROR", "content-type": "application/json" },
        body,
      }),
    ).toBeNull();
    expect(
      parseChatStompError({
        headers: { message: "AUTHENTICATION_REQUIRED", "content-type": "application/json" },
        body: JSON.stringify({ code: "AUTHENTICATION_REQUIRED", retryable: true }),
      }),
    ).toBeNull();
    expect(
      parseChatStompError({
        headers: { message: "AUTHENTICATION_REQUIRED", "content-type": "application/json" },
        body: "not-json",
      }),
    ).toBeNull();
  });
});

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

  it("메시지 수정 요청의 mutation UUID와 strip된 content를 검증한다", () => {
    expect(
      chatMessageEditRequestSchema.parse({
        clientMutationId: REQUEST_ID,
        messageId: "message-01",
        content: " \t수정된 메시지\n ",
      }),
    ).toEqual({
      clientMutationId: REQUEST_ID,
      messageId: "message-01",
      content: "수정된 메시지",
    });
    expect(
      chatMessageEditRequestSchema.safeParse({
        clientMutationId: "not-a-uuid",
        messageId: "message-01",
        content: "수정된 메시지",
      }).success,
    ).toBe(false);
  });

  it("메시지 삭제 요청의 mutation UUID와 messageId를 검증한다", () => {
    expect(
      chatMessageDeleteRequestSchema.parse({
        clientMutationId: REQUEST_ID,
        messageId: "message-01",
      }),
    ).toEqual({
      clientMutationId: REQUEST_ID,
      messageId: "message-01",
    });
    expect(
      chatMessageDeleteRequestSchema.safeParse({
        clientMutationId: REQUEST_ID,
        messageId: "",
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
  it("CREATE/UPDATE/DELETE 이벤트의 전체 snapshot을 REST ChatMessage 계약으로 검증한다", () => {
    const event = {
      eventVersion: 2,
      eventType: "CHAT_MESSAGE_CREATED",
      payload: {
        messageId: "message-01",
        roomId: "room-01",
        roomSequence: 1,
        countable: true,
        senderMembershipId: "membership-01",
        clientMessageId: CLIENT_MESSAGE_ID,
        content: "안녕하세요.",
        createdAt: "2026-07-29T04:40:00Z",
        deletedAt: null,
        messageVersion: 1,
        state: "ACTIVE",
        updatedAt: "2026-07-29T04:40:00Z",
      },
    };
    const updatedEvent = {
      ...event,
      eventType: "CHAT_MESSAGE_UPDATED",
      payload: {
        ...event.payload,
        content: "수정된 메시지",
        messageVersion: 2,
        updatedAt: "2026-07-29T04:41:00Z",
      },
    };
    const deletedEvent = {
      ...event,
      eventType: "CHAT_MESSAGE_DELETED",
      payload: {
        ...updatedEvent.payload,
        content: null,
        deletedAt: "2026-07-29T04:42:00Z",
        messageVersion: 3,
        state: "DELETED_BY_AUTHOR",
        updatedAt: "2026-07-29T04:42:00Z",
      },
    };

    expect(parseChatMessageEvent(JSON.stringify(event))).toEqual(event);
    expect(parseChatMessageEvent(JSON.stringify(updatedEvent))).toEqual(updatedEvent);
    expect(parseChatMessageEvent(JSON.stringify(deletedEvent))).toEqual(deletedEvent);
    expect(parseChatMessageEvent(JSON.stringify({ ...event, eventVersion: 1 }))).toBeNull();
    expect(
      parseChatMessageEvent(
        JSON.stringify({
          ...event,
          payload: { ...event.payload, senderMembershipId: undefined },
        }),
      ),
    ).toBeNull();
  });

  it("메시지 이벤트 종류와 맞지 않는 snapshot 상태를 거절한다", () => {
    const activePayload = {
      messageId: "message-01",
      roomId: "room-01",
      roomSequence: 1,
      countable: true,
      senderMembershipId: "membership-01",
      clientMessageId: CLIENT_MESSAGE_ID,
      content: "안녕하세요.",
      createdAt: "2026-07-29T04:40:00Z",
      deletedAt: null,
      messageVersion: 2,
      state: "ACTIVE",
      updatedAt: "2026-07-29T04:41:00Z",
    };

    expect(
      parseChatMessageEvent(
        JSON.stringify({
          eventVersion: 2,
          eventType: "CHAT_MESSAGE_CREATED",
          payload: activePayload,
        }),
      ),
    ).toBeNull();
    expect(
      parseChatMessageEvent(
        JSON.stringify({
          eventVersion: 2,
          eventType: "CHAT_MESSAGE_DELETED",
          payload: activePayload,
        }),
      ),
    ).toBeNull();
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

  it("수정·삭제 command의 성공과 no-op 결과를 상태별 snapshot으로 검증한다", () => {
    const results = [
      createMutationResult("EDIT_MESSAGE", "UPDATED", "ACTIVE", 2),
      createMutationResult("EDIT_MESSAGE", "UNCHANGED", "ACTIVE", 2),
      createMutationResult("DELETE_MESSAGE", "DELETED", "DELETED_BY_AUTHOR", 3),
      createMutationResult("DELETE_MESSAGE", "ALREADY_DELETED", "DELETED_BY_AUTHOR", 3),
    ] as const;

    for (const result of results) {
      expect(parseChatMessageMutationCommandResult(JSON.stringify(result))).toEqual(result);
    }

    expect(parseChatMessageCommandResult(JSON.stringify(results[0]))).toBeNull();
    expect(
      parseChatMessageMutationCommandResult(
        JSON.stringify({
          ...results[0],
          commandType: "DELETE_MESSAGE",
        }),
      ),
    ).toBeNull();
  });

  it("MESSAGE_DELETED 거절은 현재 tombstone snapshot을 필수로 검증한다", () => {
    const rejected = {
      clientMessageId: null,
      clientMutationId: REQUEST_ID,
      commandType: "EDIT_MESSAGE",
      status: "REJECTED",
      code: "MESSAGE_DELETED",
      retryable: false,
      retryAfterMs: null,
      messageId: "message-01",
      roomSequence: 1,
      messageVersion: 3,
      messageState: "DELETED_BY_AUTHOR",
      replayed: false,
    };

    expect(parseChatMessageMutationCommandResult(JSON.stringify(rejected))).toEqual(rejected);
    expect(
      parseChatMessageMutationCommandResult(
        JSON.stringify({
          ...rejected,
          messageVersion: null,
        }),
      ),
    ).toBeNull();
  });

  it("수정·삭제 command의 일반 거절과 실패는 snapshot nullable 계약을 따른다", () => {
    const rateLimited = {
      clientMessageId: null,
      clientMutationId: REQUEST_ID,
      commandType: "EDIT_MESSAGE",
      status: "REJECTED",
      code: "USER_RATE_LIMITED",
      retryable: true,
      retryAfterMs: 1_000,
      messageId: "message-01",
      roomSequence: null,
      messageVersion: null,
      messageState: null,
      replayed: false,
    };
    const failed = {
      clientMessageId: null,
      clientMutationId: REQUEST_ID,
      commandType: "DELETE_MESSAGE",
      status: "FAILED",
      code: "PERSISTENCE_FAILED",
      retryable: true,
      retryAfterMs: null,
      messageId: null,
      roomSequence: null,
      messageVersion: null,
      messageState: null,
      replayed: false,
    };

    expect(parseChatMessageMutationCommandResult(JSON.stringify(rateLimited))).toEqual(rateLimited);
    expect(parseChatMessageMutationCommandResult(JSON.stringify(failed))).toEqual(failed);
    expect(
      parseChatMessageMutationCommandResult(
        JSON.stringify({
          ...failed,
          retryAfterMs: 1_000,
        }),
      ),
    ).toBeNull();
    expect(
      parseChatMessageMutationCommandResult(
        JSON.stringify({
          ...failed,
          replayed: undefined,
        }),
      ),
    ).toBeNull();
  });

  it("멤버 상태를 포함한 Room Event를 검증한다", () => {
    const event = createRoomEvent("ROOM_MEMBER_JOINED", {
      member: createMemberState("membership-02", "MEMBER"),
    });

    expect(parseChatRoomEventEnvelope(JSON.stringify(event))).toEqual(event);
    expect(parseChatSystemEvent(JSON.stringify(event))).toEqual(event);
    expect(parseChatRoomEventEnvelope(JSON.stringify({ ...event, eventVersion: 1 }))).toBeNull();
  });

  it("방장 위임 Room Event의 양쪽 사용자 상태를 검증한다", () => {
    const event = createRoomEvent("ROOM_OWNERSHIP_TRANSFERRED", {
      previousOwner: createMemberState("membership-01", "MEMBER"),
      newOwner: createMemberState("membership-02", "OWNER"),
    });

    expect(parseChatRoomEventEnvelope(JSON.stringify(event))).toEqual(event);
  });

  it("전체 설정 snapshot을 포함한 ROOM_SETTINGS_UPDATED를 두 수신 경로에서 검증한다", () => {
    const event = createRoomEvent("ROOM_SETTINGS_UPDATED", {
      name: "새 방 이름",
      description: "새 방 설명",
      categories: ["ENVIRONMENT"],
      visibility: "UNLISTED",
      joinPolicy: "INVITE_ONLY",
    });

    expect(parseChatRoomEventEnvelope(JSON.stringify(event))).toEqual(event);
    expect(parseChatSystemEvent(JSON.stringify(event))).toEqual(event);
  });

  it("ROOM_SETTINGS_UPDATED의 description이 canonical하지 않으면 거절한다", () => {
    const event = createRoomEvent("ROOM_SETTINGS_UPDATED", {
      name: "새 방 이름",
      description: " 앞뒤 공백 ",
      visibility: "LISTED",
      joinPolicy: "OPEN",
    });

    expect(parseChatRoomEventEnvelope(JSON.stringify(event))).toBeNull();
  });

  it("Room Event 상태 객체는 membershipId를 필수로 하고 legacy userId로 대체하지 않는다", () => {
    const member = createMemberState("membership-02", "MEMBER");
    const memberWithoutMembershipId: Partial<typeof member> & { userId?: string } = {
      ...member,
      userId: "local-user-2",
    };
    delete memberWithoutMembershipId.membershipId;
    const event = createRoomEvent("ROOM_MEMBER_JOINED", {
      member: memberWithoutMembershipId,
    });

    expect(parseChatRoomEventEnvelope(JSON.stringify(event))).toBeNull();
  });

  it("잘못된 JSON과 알려지지 않은 system event를 무시한다", () => {
    expect(parseChatSystemEvent("{")).toBeNull();
    expect(parseChatSystemEvent(JSON.stringify({ eventType: "UNKNOWN" }))).toBeNull();
  });
});

describe("room inbox event contracts", () => {
  it("CREATE, UPDATE, DELETE 이벤트의 nullability 계약을 검증한다", () => {
    expect(parseChatRoomInboxEvent(JSON.stringify(ROOM_INBOX_CREATED_EVENT))).toEqual(
      ROOM_INBOX_CREATED_EVENT,
    );
    expect(
      parseChatRoomInboxEvent(JSON.stringify({ ...ROOM_INBOX_CREATED_EVENT, eventVersion: 1 })),
    ).toBeNull();
    expect(
      parseChatRoomInboxEvent(
        JSON.stringify({
          ...ROOM_INBOX_CREATED_EVENT,
          notificationHint: {
            ...ROOM_INBOX_CREATED_EVENT.notificationHint,
            senderMembershipId: undefined,
          },
        }),
      ),
    ).toBeNull();

    const updatedEvent = {
      ...ROOM_INBOX_CREATED_EVENT,
      eventId: "550e8400-e29b-41d4-a716-446655440001",
      cause: "MESSAGE_UPDATED",
      roomNameHint: null,
      sourceEventIds: ["chat-message-updated:message-84:v2"],
      coalescedCreateCount: null,
      notificationHint: null,
    };
    expect(parseChatRoomInboxEvent(JSON.stringify(updatedEvent))).toEqual(updatedEvent);

    const deletedEvent = {
      ...ROOM_INBOX_CREATED_EVENT,
      eventId: "550e8400-e29b-41d4-a716-446655440002",
      cause: "MESSAGE_DELETED",
      roomNameHint: null,
      sourceEventIds: ["chat-message-deleted:message-84:v2"],
      coalescedCreateCount: null,
      notificationHint: null,
    };

    expect(parseChatRoomInboxEvent(JSON.stringify(deletedEvent))).toEqual(deletedEvent);
  });

  it("cause별 nullable 필드 위반을 거절한다", () => {
    const updatedEvent = {
      ...ROOM_INBOX_CREATED_EVENT,
      cause: "MESSAGE_UPDATED",
      roomNameHint: null,
      sourceEventIds: ["chat-message-updated:message-84:v2"],
      coalescedCreateCount: null,
      notificationHint: null,
    };

    for (const patch of [
      { roomNameHint: "토론방" },
      { coalescedCreateCount: 1 },
      { notificationHint: ROOM_INBOX_CREATED_EVENT.notificationHint },
    ]) {
      expect(parseChatRoomInboxEvent(JSON.stringify({ ...updatedEvent, ...patch }))).toBeNull();
    }
  });

  it("sourceEventIds 크기, 중복과 CREATE count 불일치를 거절한다", () => {
    expect(
      parseChatRoomInboxEvent(
        JSON.stringify({
          ...ROOM_INBOX_CREATED_EVENT,
          sourceEventIds: [],
          coalescedCreateCount: 0,
        }),
      ),
    ).toBeNull();
    expect(
      parseChatRoomInboxEvent(
        JSON.stringify({
          ...ROOM_INBOX_CREATED_EVENT,
          sourceEventIds: Array.from(
            { length: 101 },
            (_, index) => `chat-message-created:message-${index}`,
          ),
          coalescedCreateCount: 101,
        }),
      ),
    ).toBeNull();
    expect(
      parseChatRoomInboxEvent(
        JSON.stringify({
          ...ROOM_INBOX_CREATED_EVENT,
          sourceEventIds: ["chat-message-created:message-84", "chat-message-created:message-84"],
          coalescedCreateCount: 2,
        }),
      ),
    ).toBeNull();
    expect(
      parseChatRoomInboxEvent(
        JSON.stringify({
          ...ROOM_INBOX_CREATED_EVENT,
          coalescedCreateCount: 2,
        }),
      ),
    ).toBeNull();
  });

  it.each([
    ["MESSAGE_CREATED", "chat-message-updated:message-84:v2"],
    ["MESSAGE_UPDATED", "chat-message-deleted:message-84:v2"],
    ["MESSAGE_DELETED", "chat-message-created:message-84"],
  ])("%s event의 source prefix 불일치를 거절한다", (cause, sourceEventId) => {
    const isCreated = cause === "MESSAGE_CREATED";
    expect(
      parseChatRoomInboxEvent(
        JSON.stringify({
          ...ROOM_INBOX_CREATED_EVENT,
          cause,
          roomNameHint: isCreated ? "토론방" : null,
          sourceEventIds: [sourceEventId],
          coalescedCreateCount: isCreated ? 1 : null,
          notificationHint: isCreated ? ROOM_INBOX_CREATED_EVENT.notificationHint : null,
        }),
      ),
    ).toBeNull();
  });
});

function createRoomEvent(eventType: string, state: Record<string, unknown>) {
  return {
    eventVersion: 2,
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

function createMutationResult(
  commandType: "EDIT_MESSAGE" | "DELETE_MESSAGE",
  status: "UPDATED" | "UNCHANGED" | "DELETED" | "ALREADY_DELETED",
  messageState: "ACTIVE" | "DELETED_BY_AUTHOR",
  messageVersion: number,
) {
  return {
    clientMessageId: null,
    clientMutationId: REQUEST_ID,
    commandType,
    status,
    code: null,
    retryable: false,
    retryAfterMs: null,
    messageId: "message-01",
    roomSequence: 1,
    messageVersion,
    messageState,
    replayed: false,
  };
}

function createMemberState(membershipId: string, role: "OWNER" | "MEMBER") {
  return {
    membershipId,
    role,
    status: "ACTIVE",
    membershipVersion: 1,
  };
}
