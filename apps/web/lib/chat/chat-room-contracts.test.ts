import { describe, expect, it } from "vitest";
import {
  chatMessageContentSchema,
  chatMessageSchema,
  chatMessageSendContentSchema,
  createMessageHistoryResponseSchema,
  createRoomRequestSchema,
  messageHistoryRequestSchema,
  membershipDisplayNameSchema,
  myRoomListResponseSchema,
  normalizeChatMessageContent,
  normalizeRoomDescription,
  publicRoomListParamsSchema,
  publicRoomListResponseSchema,
  roomCategoriesSchema,
  roomCategorySchema,
  roomDescriptionSchema,
  roomDetailsSchema,
  roomIdSchema,
  roomInboxListParamsSchema,
  roomInboxListResponseSchema,
  roomMembershipListResponseSchema,
  roomReadReceiptStateResponseSchema,
  targetMembershipRequestSchema,
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
        categories: ["POLICY"],
        visibility: "LISTED",
        joinPolicy: "OPEN",
      }),
    ).toEqual({
      name: "시민 AI 토론방",
      description: "",
      categories: ["POLICY"],
      visibility: "LISTED",
      joinPolicy: "OPEN",
    });
  });

  it("방 생성 설명의 누락과 null을 빈 canonical 문자열로 정규화한다", () => {
    const request = {
      name: "시민 AI 토론방",
      categories: ["POLICY"] as const,
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
      categories: ["POLICY"] as const,
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
        categories: ["POLICY"],
        visibility: "PUBLIC",
        joinPolicy: "OPEN",
      }).success,
    ).toBe(false);
  });

  it("Room category enum과 정확히 하나인 배열 계약을 검증한다", () => {
    for (const category of ["POLICY", "ENVIRONMENT", "LOCAL_ISSUE"] as const) {
      expect(roomCategorySchema.safeParse(category).success).toBe(true);
      expect(roomCategoriesSchema.parse([category])).toEqual([category]);
    }

    expect(roomCategorySchema.safeParse("UNKNOWN").success).toBe(false);
    expect(roomCategoriesSchema.safeParse([]).success).toBe(false);
    expect(roomCategoriesSchema.safeParse(["POLICY", "ENVIRONMENT"]).success).toBe(false);
    expect(roomCategoriesSchema.safeParse(null).success).toBe(false);
    expect(
      createRoomRequestSchema.safeParse({
        name: "카테고리 없는 방",
        visibility: "LISTED",
        joinPolicy: "OPEN",
      }).success,
    ).toBe(false);
  });

  it("Room category를 public, my rooms, inbox, detail 응답에서 공통 검증한다", () => {
    const publicRoom = {
      roomId: "room-01",
      name: "시민 AI 토론방",
      description: "",
      categories: ["LOCAL_ISSUE"] as const,
      ownerMembershipId: "membership-01",
      status: "ACTIVE" as const,
      visibility: "LISTED" as const,
      joinPolicy: "OPEN" as const,
      activeMemberCount: 2,
      createdAt: "2026-07-29T04:30:00Z",
      version: 2,
    };
    const membershipFields = {
      membershipId: "membership-01",
      membershipRole: "MEMBER" as const,
      membershipStatus: "ACTIVE" as const,
      joinedAt: "2026-07-29T04:31:00Z",
      membershipVersion: 1,
    };

    expect(
      publicRoomListResponseSchema.parse({ items: [publicRoom], nextCursor: null, hasNext: false })
        .items[0]?.categories,
    ).toEqual(["LOCAL_ISSUE"]);
    expect(
      myRoomListResponseSchema.parse({
        items: [{ ...publicRoom, ...membershipFields }],
        nextCursor: null,
        hasNext: false,
      }).items[0]?.categories,
    ).toEqual(["LOCAL_ISSUE"]);
    expect(roomInboxListResponseSchema.parse(createRoomInboxPage()).items[0]?.categories).toEqual([
      "POLICY",
    ]);
    expect(
      publicRoomListResponseSchema.safeParse({
        items: [{ ...publicRoom, categories: undefined }],
        nextCursor: null,
        hasNext: false,
      }).success,
    ).toBe(false);
    expect(
      publicRoomListResponseSchema.safeParse({
        items: [{ ...publicRoom, ownerMembershipId: undefined }],
        nextCursor: null,
        hasNext: false,
      }).success,
    ).toBe(false);
  });

  it("방 상세 응답의 nullable 멤버십을 허용한다", () => {
    const result = roomDetailsSchema.parse({
      roomId: "room-01",
      name: "시민 AI 토론방",
      description: "",
      categories: ["ENVIRONMENT"],
      ownerMembershipId: "membership-01",
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

  it("Room 참여자 목록의 필수 프로필을 파싱한다", () => {
    const result = roomMembershipListResponseSchema.parse({
      items: [createRoomMembershipListItem()],
      nextCursor: null,
      hasNext: false,
    });

    expect(result.items[0]).toMatchObject({
      membershipId: "membership-02",
      displayName: "참여자 2",
      imageUrl: null,
      profileVersion: 1,
    });
  });

  it("Room 참여자 목록에서 프로필 누락과 잘못된 profileVersion을 거절한다", () => {
    const membership = createRoomMembershipListItem();

    for (const patch of [
      { displayName: undefined },
      { imageUrl: undefined },
      { profileVersion: undefined },
      { profileVersion: 0 },
      { profileVersion: -1 },
      { profileVersion: 1.5 },
    ]) {
      expect(
        roomMembershipListResponseSchema.safeParse({
          items: [{ ...membership, ...patch }],
          nextCursor: null,
          hasNext: false,
        }).success,
      ).toBe(false);
    }
  });

  it("참여자 표시 이름을 trim된 Unicode code point 1~50자로 제한한다", () => {
    expect(membershipDisplayNameSchema.safeParse("😀".repeat(50)).success).toBe(true);
    expect(membershipDisplayNameSchema.safeParse("😀".repeat(51)).success).toBe(false);
    expect(membershipDisplayNameSchema.safeParse("").success).toBe(false);
    expect(membershipDisplayNameSchema.safeParse(" 참여자 2").success).toBe(false);
    expect(membershipDisplayNameSchema.safeParse("참여자 2 ").success).toBe(false);
  });

  it("Room command 대상은 targetMembershipId 하나만 허용한다", () => {
    expect(targetMembershipRequestSchema.parse({ targetMembershipId: " membership-02 " })).toEqual({
      targetMembershipId: "membership-02",
    });
    expect(targetMembershipRequestSchema.safeParse({ targetMembershipId: "   " }).success).toBe(
      false,
    );
    expect(targetMembershipRequestSchema.safeParse({ targetUserId: "user-02" }).success).toBe(
      false,
    );
    expect(
      targetMembershipRequestSchema.safeParse({
        targetMembershipId: "membership-02",
        targetUserId: "user-02",
      }).success,
    ).toBe(false);
  });

  it("다음 페이지가 있으면 opaque nextCursor를 요구한다", () => {
    const result = publicRoomListResponseSchema.safeParse({
      items: [],
      nextCursor: null,
      hasNext: true,
    });

    expect(result.success).toBe(false);
  });

  it("공개 방 검색 조건을 정규화하고 enum을 검증한다", () => {
    expect(
      publicRoomListParamsSchema.parse({
        query: "  교통 정책  ",
        category: "LOCAL_ISSUE",
        joinPolicy: "OPEN",
        cursor: "opaque cursor",
        limit: 20,
      }),
    ).toEqual({
      query: "교통 정책",
      category: "LOCAL_ISSUE",
      joinPolicy: "OPEN",
      cursor: "opaque cursor",
      limit: 20,
    });
    expect(publicRoomListParamsSchema.parse({ query: "   " }).query).toBeUndefined();
    expect(publicRoomListParamsSchema.safeParse({ category: "UNKNOWN" }).success).toBe(false);
  });

  it("공개 방 검색어를 Unicode code point 100자로 제한하고 제어 문자를 거절한다", () => {
    expect(publicRoomListParamsSchema.safeParse({ query: "😀".repeat(100) }).success).toBe(true);
    expect(publicRoomListParamsSchema.safeParse({ query: "😀".repeat(101) }).success).toBe(false);
    expect(publicRoomListParamsSchema.safeParse({ query: "교통\n정책" }).success).toBe(false);
  });

  it("마지막 cursor page에서 생략된 nextCursor를 null로 정규화한다", () => {
    expect(
      publicRoomListResponseSchema.parse({
        items: [],
        hasNext: false,
      }).nextCursor,
    ).toBeNull();
    expect(
      publicRoomListResponseSchema.safeParse({
        items: [],
        hasNext: true,
      }).success,
    ).toBe(false);
  });

  it("Room inbox unread projection과 최대 limit 20을 검증한다", () => {
    const page = roomInboxListResponseSchema.parse({
      items: [createRoomInboxItem()],
      nextCursor: "membership-01",
      hasNext: true,
    });

    expect(page.items[0]).toMatchObject({
      readThroughSequence: 123,
      unreadCount: 200,
      unreadCountCapped: false,
      lastActivityAt: "2026-08-04T08:30:00Z",
      lastMessage: {
        state: "ACTIVE",
        preview: "수정된 메시지",
      },
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

  it("Room inbox ACTIVE, 삭제, 노출 메시지 없음 계약을 검증한다", () => {
    expect(roomInboxListResponseSchema.safeParse(createRoomInboxPage()).success).toBe(true);
    expect(
      roomInboxListResponseSchema.safeParse(
        createRoomInboxPage({
          lastMessage: {
            ...createRoomInboxItem().lastMessage,
            state: "DELETED_BY_AUTHOR",
            preview: null,
            previewTruncated: false,
          },
        }),
      ).success,
    ).toBe(true);
    expect(
      roomInboxListResponseSchema.safeParse(
        createRoomInboxPage({
          lastMessage: null,
          lastActivityAt: "2026-08-04T09:00:00Z",
        }),
      ).success,
    ).toBe(true);
  });

  it.each([
    ["lastMessage 누락", { lastMessage: undefined }],
    ["lastActivityAt 누락", { lastActivityAt: undefined }],
    ["lastActivityAt null", { lastActivityAt: null }],
    [
      "ACTIVE preview null",
      { lastMessage: { ...createRoomInboxItem().lastMessage, preview: null } },
    ],
    [
      "ACTIVE preview 60 code point 초과",
      { lastMessage: { ...createRoomInboxItem().lastMessage, preview: "😀".repeat(61) } },
    ],
    [
      "삭제 preview 문자열",
      {
        lastMessage: {
          ...createRoomInboxItem().lastMessage,
          state: "DELETED_BY_AUTHOR",
          preview: "삭제 전 메시지",
          previewTruncated: false,
        },
      },
    ],
    [
      "삭제 previewTruncated true",
      {
        lastMessage: {
          ...createRoomInboxItem().lastMessage,
          state: "DELETED_BY_AUTHOR",
          preview: null,
          previewTruncated: true,
        },
      },
    ],
    ["roomSequence 0", { lastMessage: { ...createRoomInboxItem().lastMessage, roomSequence: 0 } }],
    [
      "messageVersion 0",
      { lastMessage: { ...createRoomInboxItem().lastMessage, messageVersion: 0 } },
    ],
    [
      "알 수 없는 state",
      { lastMessage: { ...createRoomInboxItem().lastMessage, state: "UNKNOWN" } },
    ],
    ["createdAt/activityAt 불일치", { lastActivityAt: "2026-08-04T08:31:00Z" }],
  ])("Room inbox의 잘못된 %s 응답을 거절한다", (_label, patch) => {
    expect(roomInboxListResponseSchema.safeParse(createRoomInboxPage(patch)).success).toBe(false);
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

  it("Read Receipt snapshot을 파싱하고 계약에 없는 effective cursor는 노출하지 않는다", () => {
    const parsed = roomReadReceiptStateResponseSchema.parse(createRoomReadReceiptState());

    expect(parsed).toEqual({
      roomId: "room-01",
      roomVersion: 12,
      selfMembershipId: "membership-a",
      positions: [
        {
          membershipId: "membership-a",
          membershipVersion: 3,
          messageVisibleAfterSequence: 0,
          storedLastReadSequence: 130,
        },
        {
          membershipId: "membership-b",
          membershipVersion: 2,
          messageVisibleAfterSequence: 100,
          storedLastReadSequence: 118,
        },
      ],
      generatedAt: "2026-08-10T03:00:00Z",
    });
    expect(parsed).not.toHaveProperty("effectiveReadThroughSequence");
  });

  it("Read Receipt snapshot의 self 누락, 중복 membership과 unsafe integer를 거절한다", () => {
    expect(
      roomReadReceiptStateResponseSchema.safeParse(
        createRoomReadReceiptState({ selfMembershipId: "membership-missing" }),
      ).success,
    ).toBe(false);
    expect(
      roomReadReceiptStateResponseSchema.safeParse(
        createRoomReadReceiptState({
          positions: [
            createReadReceiptPosition("membership-a"),
            createReadReceiptPosition("membership-a"),
          ],
        }),
      ).success,
    ).toBe(false);
    expect(
      roomReadReceiptStateResponseSchema.safeParse(
        createRoomReadReceiptState({ roomVersion: Number.MAX_SAFE_INTEGER + 1 }),
      ).success,
    ).toBe(false);
    expect(
      roomReadReceiptStateResponseSchema.safeParse(
        createRoomReadReceiptState({
          positions: Array.from({ length: 101 }, (_, index) =>
            createReadReceiptPosition(index === 0 ? "membership-a" : `membership-${index}`),
          ),
        }),
      ).success,
    ).toBe(false);
  });

  it("Read Receipt positions를 locale 없는 raw string natural order로 검증한다", () => {
    const ascendingPositions = ["A", "a", "e\u0301", "é", "가"].map((membershipId) =>
      createReadReceiptPosition(membershipId),
    );

    expect(
      roomReadReceiptStateResponseSchema.safeParse(
        createRoomReadReceiptState({
          selfMembershipId: "A",
          positions: ascendingPositions,
        }),
      ).success,
    ).toBe(true);
    expect(
      roomReadReceiptStateResponseSchema.safeParse(
        createRoomReadReceiptState({
          selfMembershipId: "A",
          positions: [ascendingPositions[1], ascendingPositions[0]],
        }),
      ).success,
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
    expect(
      chatMessageSchema.safeParse({ ...activeMessage, senderMembershipId: undefined }).success,
    ).toBe(false);
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
    senderMembershipId: "membership-01",
    clientMessageId: "ed7d2fe8-996d-4660-822f-e84af1218743",
    content: "안녕하세요.",
    createdAt: "2026-07-29T04:40:00Z",
    deletedAt: null,
    messageVersion: 1,
    state: "ACTIVE" as const,
    updatedAt: "2026-07-29T04:40:00Z",
  };
}

function createRoomReadReceiptState(patch: Record<string, unknown> = {}) {
  return {
    roomId: "room-01",
    roomVersion: 12,
    selfMembershipId: "membership-a",
    positions: [
      createReadReceiptPosition("membership-a", {
        membershipVersion: 3,
        storedLastReadSequence: 130,
      }),
      createReadReceiptPosition("membership-b", {
        membershipVersion: 2,
        messageVisibleAfterSequence: 100,
        storedLastReadSequence: 118,
      }),
    ],
    generatedAt: "2026-08-10T03:00:00Z",
    effectiveReadThroughSequence: 130,
    ...patch,
  };
}

function createReadReceiptPosition(membershipId: string, patch: Record<string, unknown> = {}) {
  return {
    membershipId,
    membershipVersion: 1,
    messageVisibleAfterSequence: 0,
    storedLastReadSequence: 0,
    ...patch,
  };
}

function createRoomMembershipListItem(patch: Record<string, unknown> = {}) {
  return {
    membershipId: "membership-02",
    displayName: "참여자 2",
    imageUrl: null,
    profileVersion: 1,
    role: "MEMBER",
    status: "ACTIVE",
    joinedAt: "2026-08-10T03:00:00Z",
    leftAt: null,
    bannedAt: null,
    version: 1,
    ...patch,
  };
}

function createRoomInboxItem() {
  return {
    roomId: "room-01",
    name: "시민 AI 토론방",
    description: "",
    categories: ["POLICY"] as const,
    ownerMembershipId: "membership-01",
    status: "ACTIVE" as const,
    visibility: "LISTED" as const,
    joinPolicy: "OPEN" as const,
    activeMemberCount: 2,
    createdAt: "2026-07-29T04:30:00Z",
    version: 2,
    membershipId: "membership-01",
    membershipRole: "OWNER" as const,
    membershipStatus: "ACTIVE" as const,
    joinedAt: "2026-07-29T04:30:00Z",
    membershipVersion: 1,
    readThroughSequence: 123,
    unreadCount: 200,
    unreadCountCapped: false,
    lastMessage: {
      messageId: "message-101",
      roomSequence: 101,
      messageVersion: 2,
      state: "ACTIVE" as const,
      preview: "수정된 메시지",
      previewTruncated: false,
      createdAt: "2026-08-04T08:30:00Z",
    },
    lastActivityAt: "2026-08-04T08:30:00Z",
  };
}

function createRoomInboxPage(patch: Record<string, unknown> = {}) {
  return {
    items: [{ ...createRoomInboxItem(), ...patch }],
    nextCursor: null,
    hasNext: false,
  };
}

function createRoomRequest(description: string) {
  return {
    name: "시민 AI 토론방",
    description,
    categories: ["POLICY"],
    visibility: "LISTED",
    joinPolicy: "OPEN",
  };
}
