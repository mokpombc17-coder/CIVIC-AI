import { describe, expect, it } from "vitest";
import {
  chatMessageContentSchema,
  chatMessageSchema,
  chatMessageSendContentSchema,
  createMessageHistoryResponseSchema,
  createRoomRequestSchema,
  messageHistoryRequestSchema,
  normalizeChatMessageContent,
  normalizeRoomDescription,
  publicRoomListResponseSchema,
  roomDescriptionSchema,
  roomDetailsSchema,
  roomIdSchema,
  roomInboxListParamsSchema,
  roomInboxListResponseSchema,
  updateRoomReadStateRequestSchema,
  updateRoomReadStateResponseSchema,
  updateRoomSettingsRequestSchema,
  updateRoomSettingsResponseSchema,
} from "./chat-room-contracts";

describe("chat room REST contracts", () => {
  it("방 생성 요청의 이름을 정규화한다", () => {
    expect(
      createRoomRequestSchema.parse({
        name: "  시민 AI 토론방  ",
        visibility: "LISTED",
        joinPolicy: "OPEN",
      }),
    ).toEqual({
      name: "시민 AI 토론방",
      description: "",
      visibility: "LISTED",
      joinPolicy: "OPEN",
    });
  });

  it("방 생성 설명의 누락과 null을 빈 canonical 문자열로 정규화한다", () => {
    const request = {
      name: "시민 AI 토론방",
      visibility: "LISTED" as const,
      joinPolicy: "OPEN" as const,
    };

    expect(createRoomRequestSchema.parse(request).description).toBe("");
    expect(createRoomRequestSchema.parse({ ...request, description: null }).description).toBe("");
    expect(
      createRoomRequestSchema.parse({
        ...request,
        description: " \t\u3000AI 정책을\n논의합니다.\u3000\r ",
      }).description,
    ).toBe("AI 정책을\n논의합니다.");
  });

  it("방 설명은 raw 제어문자를 먼저 검사하고 strip 이후 code point를 제한한다", () => {
    expect(normalizeRoomDescription(" \t\u3000방 설명\u3000\r ")).toBe("방 설명");
    expect(
      createRoomRequestSchema.safeParse(createRoomRequest("\u000B방 설명\u000B")).success,
    ).toBe(false);
    expect(
      createRoomRequestSchema.safeParse(createRoomRequest("내부\tTAB\n줄바꿈\r유지")).success,
    ).toBe(true);
    expect(
      createRoomRequestSchema.safeParse(createRoomRequest(` ${"😀".repeat(500)} `)).success,
    ).toBe(true);
    expect(
      createRoomRequestSchema.safeParse(createRoomRequest(` ${"😀".repeat(501)} `)).success,
    ).toBe(false);
  });

  it("조회용 방 설명은 canonical 문자열만 허용한다", () => {
    expect(roomDescriptionSchema.safeParse("").success).toBe(true);
    expect(roomDescriptionSchema.safeParse("내부\n줄바꿈").success).toBe(true);
    expect(roomDescriptionSchema.safeParse(" 앞뒤 공백 ").success).toBe(false);
    expect(roomDescriptionSchema.safeParse("금지\u0000문자").success).toBe(false);
  });

  it("방 설정 patch는 변경 필드만 정규화하고 null, 빈 객체, 알 수 없는 필드를 거절한다", () => {
    expect(
      updateRoomSettingsRequestSchema.parse({
        description: " \t새 설명\n두 번째 줄\r ",
        visibility: "UNLISTED",
      }),
    ).toEqual({
      description: "새 설명\n두 번째 줄",
      visibility: "UNLISTED",
    });
    expect(updateRoomSettingsRequestSchema.parse({ description: "   " })).toEqual({
      description: "",
    });
    expect(updateRoomSettingsRequestSchema.safeParse({}).success).toBe(false);
    expect(updateRoomSettingsRequestSchema.safeParse({ description: null }).success).toBe(false);
    expect(
      updateRoomSettingsRequestSchema.safeParse({
        description: "설명",
        expectedVersion: 1,
      }).success,
    ).toBe(false);
  });

  it("방 설정 UPDATED와 UNCHANGED 응답은 동일한 전체 snapshot을 요구한다", () => {
    const response = {
      clientRequestId: "07af9111-3e20-43e5-ae80-78d1bf547647",
      replayed: false,
      roomId: "room-01",
      name: "시민 AI 토론방",
      description: "AI 정책을 논의합니다.",
      visibility: "LISTED" as const,
      joinPolicy: "OPEN" as const,
      roomVersion: 8,
    };

    expect(
      updateRoomSettingsResponseSchema.parse({
        ...response,
        code: "ROOM_SETTINGS_UPDATED",
      }),
    ).toEqual({
      ...response,
      code: "ROOM_SETTINGS_UPDATED",
    });
    expect(
      updateRoomSettingsResponseSchema.parse({
        ...response,
        code: "ROOM_SETTINGS_UNCHANGED",
        replayed: true,
      }),
    ).toEqual({
      ...response,
      code: "ROOM_SETTINGS_UNCHANGED",
      replayed: true,
    });
    expect(
      updateRoomSettingsResponseSchema.safeParse({
        ...response,
        code: "ROOM_SETTINGS_UNCHANGED",
        description: undefined,
      }).success,
    ).toBe(false);
  });

  it("roomId와 방 생성 요청의 enum 계약을 검증한다", () => {
    expect(roomIdSchema.safeParse("room_01-test").success).toBe(true);
    expect(roomIdSchema.safeParse("invalid room").success).toBe(false);
    expect(
      createRoomRequestSchema.safeParse({
        name: "테스트방",
        visibility: "PUBLIC",
        joinPolicy: "OPEN",
      }).success,
    ).toBe(false);
  });

  it("방 상세 응답의 nullable 멤버십을 허용한다", () => {
    const result = roomDetailsSchema.parse({
      roomId: "room-01",
      name: "시민 AI 토론방",
      description: "",
      ownerUserId: "local-user-1",
      status: "ACTIVE",
      visibility: "LISTED",
      joinPolicy: "OPEN",
      activeMemberCount: 2,
      createdAt: "2026-07-29T04:30:00Z",
      closedAt: null,
      version: 2,
      participationStatus: "NOT_JOINED",
      myMembership: null,
    });

    expect(result.myMembership).toBeNull();
  });

  it("다음 페이지가 있으면 opaque nextCursor를 요구한다", () => {
    const result = publicRoomListResponseSchema.safeParse({
      items: [],
      nextCursor: null,
      hasNext: true,
    });

    expect(result.success).toBe(false);
  });

  it("Room inbox unread projection과 최대 limit 20을 검증한다", () => {
    const page = roomInboxListResponseSchema.parse({
      items: [
        {
          roomId: "room-01",
          name: "시민 AI 토론방",
          description: "",
          ownerUserId: "local-user-1",
          status: "ACTIVE",
          visibility: "LISTED",
          joinPolicy: "OPEN",
          activeMemberCount: 2,
          createdAt: "2026-07-29T04:30:00Z",
          version: 2,
          membershipId: "membership-01",
          membershipRole: "OWNER",
          membershipStatus: "ACTIVE",
          joinedAt: "2026-07-29T04:30:00Z",
          membershipVersion: 1,
          readThroughSequence: 123,
          unreadCount: 200,
          unreadCountCapped: false,
        },
      ],
      nextCursor: "membership-01",
      hasNext: true,
    });

    expect(page.items[0]).toMatchObject({
      readThroughSequence: 123,
      unreadCount: 200,
      unreadCountCapped: false,
    });
    expect(roomInboxListParamsSchema.safeParse({ limit: 20 }).success).toBe(true);
    expect(roomInboxListParamsSchema.safeParse({ limit: 21 }).success).toBe(false);
    expect(
      roomInboxListResponseSchema.safeParse({
        ...page,
        items: [{ ...page.items[0], unreadCount: -1 }],
      }).success,
    ).toBe(false);
  });

  it("read-state 요청과 monotonic 응답 계약을 검증한다", () => {
    expect(updateRoomReadStateRequestSchema.parse({ throughSequence: 0 })).toEqual({
      throughSequence: 0,
    });
    expect(
      updateRoomReadStateResponseSchema.parse({
        roomId: "room-01",
        readThroughSequence: 123,
        updated: false,
      }),
    ).toEqual({
      roomId: "room-01",
      readThroughSequence: 123,
      updated: false,
    });
    expect(updateRoomReadStateRequestSchema.safeParse({ throughSequence: -1 }).success).toBe(false);
    expect(
      updateRoomReadStateRequestSchema.safeParse({ throughSequence: 1, unknown: true }).success,
    ).toBe(false);
  });

  it("메시지 이력 조회 방향을 동시에 지정할 수 없게 한다", () => {
    expect(
      messageHistoryRequestSchema.safeParse({
        mode: "before",
        beforeSequence: 71,
        afterSequence: 120,
        limit: 50,
      }).success,
    ).toBe(false);
    expect(
      messageHistoryRequestSchema.safeParse({
        mode: "after",
        afterSequence: 0,
        limit: 50,
      }).success,
    ).toBe(true);
  });

  it("Java String.strip 기준으로 메시지 앞뒤 공백을 제거하고 내부 줄바꿈은 보존한다", () => {
    expect(normalizeChatMessageContent(" \t\u3000안녕하세요.\n반갑습니다.\u3000\r ")).toBe(
      "안녕하세요.\n반갑습니다.",
    );
    expect(normalizeChatMessageContent("\u00A0안녕하세요.\u00A0")).toBe("\u00A0안녕하세요.\u00A0");
    expect(chatMessageSendContentSchema.parse(" \t안녕하세요.\n반갑습니다.\r ")).toBe(
      "안녕하세요.\n반갑습니다.",
    );
  });

  it("strip된 메시지 content에 서버 길이와 제어문자 제약을 적용한다", () => {
    expect(chatMessageContentSchema.safeParse("   ").success).toBe(false);
    expect(chatMessageContentSchema.safeParse(" 앞뒤 공백 ").success).toBe(false);
    expect(chatMessageContentSchema.safeParse("허용되지 않음\u0000").success).toBe(false);
    expect(chatMessageSendContentSchema.safeParse(` ${"😀".repeat(2_000)} `).success).toBe(true);
    expect(chatMessageSendContentSchema.safeParse(` ${"😀".repeat(2_001)} `).success).toBe(false);
    expect(chatMessageSendContentSchema.parse("\u000B안녕하세요.\u000B")).toBe("안녕하세요.");
    expect(chatMessageSendContentSchema.safeParse("안녕\u000B하세요.").success).toBe(false);
  });

  it("조회 방향 cursor와 roomSequence 오름차순을 검증한다", () => {
    const latestSchema = createMessageHistoryResponseSchema(
      {
        mode: "latest",
      },
      "room-01",
    );

    expect(
      latestSchema.safeParse({
        items: [createMessage(119), createMessage(120)],
        nextBeforeSequence: 119,
        nextAfterSequence: null,
        hasMore: true,
      }).success,
    ).toBe(true);
    expect(
      latestSchema.safeParse({
        items: [createMessage(120), createMessage(119)],
        nextBeforeSequence: null,
        nextAfterSequence: 120,
        hasMore: true,
      }).success,
    ).toBe(false);
  });

  it("활성 메시지와 작성자 삭제 tombstone snapshot을 구분해 검증한다", () => {
    const activeMessage = createMessage(1);
    const deletedMessage = {
      ...activeMessage,
      content: null,
      state: "DELETED_BY_AUTHOR",
      messageVersion: 2,
      updatedAt: "2026-07-29T05:00:00Z",
      deletedAt: "2026-07-29T05:00:00Z",
    };

    expect(chatMessageSchema.parse(activeMessage)).toEqual(activeMessage);
    expect(chatMessageSchema.parse(deletedMessage)).toEqual(deletedMessage);
    expect(chatMessageSchema.safeParse({ ...activeMessage, countable: undefined }).success).toBe(
      false,
    );
    expect(
      chatMessageSchema.safeParse({
        ...deletedMessage,
        content: "삭제 전 내용",
      }).success,
    ).toBe(false);
    expect(
      chatMessageSchema.safeParse({
        ...deletedMessage,
        deletedAt: "2026-07-29T05:01:00Z",
      }).success,
    ).toBe(false);
  });
});

function createMessage(roomSequence: number) {
  return {
    messageId: `message-${roomSequence}`,
    roomId: "room-01",
    roomSequence,
    countable: true,
    senderUserId: "local-user-1",
    clientMessageId: "ed7d2fe8-996d-4660-822f-e84af1218743",
    content: "안녕하세요.",
    createdAt: "2026-07-29T04:40:00Z",
    deletedAt: null,
    messageVersion: 1,
    state: "ACTIVE" as const,
    updatedAt: "2026-07-29T04:40:00Z",
  };
}

function createRoomRequest(description: string) {
  return {
    name: "시민 AI 토론방",
    description,
    visibility: "LISTED",
    joinPolicy: "OPEN",
  };
}
