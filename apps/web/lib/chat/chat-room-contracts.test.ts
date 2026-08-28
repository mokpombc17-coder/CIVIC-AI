import { describe, expect, it } from "vitest";
import {
  chatMessageContentSchema,
  chatMessageSchema,
  chatMessageSendContentSchema,
  createMessageHistoryResponseSchema,
  createRoomMessageContextResponseSchema,
  createRoomMessageSearchResponseSchema,
  createRoomRequestSchema,
  createRoomResponseSchema,
  messageHistoryRequestSchema,
  membershipDisplayNameSchema,
  myRoomListResponseSchema,
  normalizeChatMessageContent,
  normalizeRoomMessageSearchQuery,
  normalizeRoomDescription,
  publicRoomListParamsSchema,
  publicRoomListResponseSchema,
  roomCategoryIdsSchema,
  roomCategoryIdSchema,
  roomCreationRequestListResponseSchema,
  roomDescriptionSchema,
  roomDetailsSchema,
  roomIdSchema,
  roomInboxListParamsSchema,
  roomInboxListResponseSchema,
  roomMembershipListResponseSchema,
  roomMessageContextParamsSchema,
  roomMessageSearchQuerySchema,
  roomMessageSearchRequestSchema,
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
      categoryIds: ["00000000-0000-4000-8000-000000000001"] as const,
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

  it.each([
    {
      code: "ROOM_CREATION_REQUESTED",
      status: "PENDING",
      resolvedAt: null,
      roomId: null,
      ownerMembershipId: null,
      roomVersion: null,
      ownerMembershipVersion: null,
      rejectionReason: null,
    },
    {
      code: "ROOM_CREATED",
      status: "APPROVED",
      resolvedAt: "2026-08-25T07:00:01Z",
      roomId: "room-123",
      ownerMembershipId: "membership-123",
      roomVersion: 1,
      ownerMembershipVersion: 1,
      rejectionReason: null,
    },
    {
      code: "ROOM_CREATION_REJECTED",
      status: "REJECTED",
      resolvedAt: "2026-08-25T07:00:01Z",
      roomId: null,
      ownerMembershipId: null,
      roomVersion: null,
      ownerMembershipVersion: null,
      rejectionReason: "연구 목적과 맞지 않는 Room입니다.",
    },
    {
      code: "ROOM_CREATION_CANCELED",
      status: "CANCELED",
      resolvedAt: "2026-08-25T07:00:01Z",
      roomId: null,
      ownerMembershipId: null,
      roomVersion: null,
      ownerMembershipVersion: null,
      rejectionReason: null,
    },
  ] as const)("방 생성 신청의 $status 응답을 허용한다", (state) => {
    const response = createRoomCreationResponse(state);

    expect(createRoomResponseSchema.parse(response)).toEqual(response);
  });

  it("방 생성 신청 status와 code 조합이 다르면 거절한다", () => {
    expect(
      createRoomResponseSchema.safeParse(
        createRoomCreationResponse({
          code: "ROOM_CREATED",
          status: "PENDING",
          resolvedAt: null,
          roomId: null,
          ownerMembershipId: null,
          roomVersion: null,
          ownerMembershipVersion: null,
          rejectionReason: null,
        }),
      ).success,
    ).toBe(false);
  });

  it("방 생성 신청 상태별 nullable invariant를 검증한다", () => {
    expect(
      createRoomResponseSchema.safeParse(
        createRoomCreationResponse({
          code: "ROOM_CREATION_REQUESTED",
          status: "PENDING",
          resolvedAt: "2026-08-25T07:00:01Z",
          roomId: "room-123",
          ownerMembershipId: "membership-123",
          roomVersion: 1,
          ownerMembershipVersion: 1,
          rejectionReason: null,
        }),
      ).success,
    ).toBe(false);
    expect(
      createRoomResponseSchema.safeParse(
        createRoomCreationResponse({
          code: "ROOM_CREATION_REJECTED",
          status: "REJECTED",
          resolvedAt: "2026-08-25T07:00:01Z",
          roomId: null,
          ownerMembershipId: null,
          roomVersion: null,
          ownerMembershipVersion: null,
          rejectionReason: null,
        }),
      ).success,
    ).toBe(false);
  });

  it("방 생성 반려 사유는 canonical 한 줄 100 code point 이하여야 한다", () => {
    const createRejectedResponse = (rejectionReason: string) =>
      createRoomCreationResponse({
        code: "ROOM_CREATION_REJECTED",
        status: "REJECTED",
        resolvedAt: "2026-08-25T07:00:01Z",
        roomId: null,
        ownerMembershipId: null,
        roomVersion: null,
        ownerMembershipVersion: null,
        rejectionReason,
      });

    expect(createRoomResponseSchema.safeParse(createRejectedResponse("반려 사유")).success).toBe(
      true,
    );
    expect(createRoomResponseSchema.safeParse(createRejectedResponse(" 반려 사유 ")).success).toBe(
      false,
    );
    expect(
      createRoomResponseSchema.safeParse(createRejectedResponse("첫 줄\n둘째 줄")).success,
    ).toBe(false);
    expect(
      createRoomResponseSchema.safeParse(createRejectedResponse("😀".repeat(101))).success,
    ).toBe(false);
  });

  it("내 방 생성 신청 목록은 상세 응답과 동일한 item 및 cursor 계약을 사용한다", () => {
    const pending = createRoomCreationResponse({
      code: "ROOM_CREATION_REQUESTED",
      status: "PENDING",
      resolvedAt: null,
      roomId: null,
      ownerMembershipId: null,
      roomVersion: null,
      ownerMembershipVersion: null,
      rejectionReason: null,
    });

    expect(
      roomCreationRequestListResponseSchema.parse({
        items: [pending],
        nextCursor: "opaque cursor",
        hasNext: true,
      }),
    ).toEqual({
      items: [pending],
      nextCursor: "opaque cursor",
      hasNext: true,
    });
    expect(
      roomCreationRequestListResponseSchema.safeParse({
        items: [pending],
        nextCursor: null,
        hasNext: true,
      }).success,
    ).toBe(false);
  });

  it("roomId와 방 생성 요청의 enum 계약을 검증한다", () => {
    expect(roomIdSchema.safeParse("room_01-test").success).toBe(true);
    expect(roomIdSchema.safeParse("invalid room").success).toBe(false);
    expect(
      createRoomRequestSchema.safeParse({
        name: "테스트방",
        categoryIds: ["00000000-0000-4000-8000-000000000001"],
        visibility: "PUBLIC",
        joinPolicy: "OPEN",
      }).success,
    ).toBe(false);
  });

  it("Room category ID와 배열 계약을 검증한다", () => {
    const categoryIds = ["00000000-0000-0000-0000-000000000001", "category-policy"] as const;

    expect(roomCategoryIdSchema.safeParse(categoryIds[0]).success).toBe(true);
    expect(roomCategoryIdSchema.safeParse("").success).toBe(false);
    expect(roomCategoryIdsSchema.parse(categoryIds)).toEqual(categoryIds);
    expect(roomCategoryIdsSchema.parse([])).toEqual([]);
    expect(roomCategoryIdsSchema.safeParse(null).success).toBe(false);
    expect(
      createRoomRequestSchema.safeParse({
        name: "카테고리 없는 방",
        visibility: "LISTED",
        joinPolicy: "OPEN",
      }).success,
    ).toBe(true);
  });

  it("Room category ID와 표시 정보를 응답별 계약에 맞게 검증한다", () => {
    const publicRoom = {
      roomId: "room-01",
      name: "시민 AI 토론방",
      description: "",
      categoryIds: ["00000000-0000-4000-8000-000000000003"] as const,
      categorySummaries: [
        { categoryId: "00000000-0000-4000-8000-000000000003", name: "지역 현안" },
      ],
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
        .items[0]?.categoryIds,
    ).toEqual(["00000000-0000-4000-8000-000000000003"]);
    expect(
      publicRoomListResponseSchema.parse({ items: [publicRoom], nextCursor: null, hasNext: false })
        .items[0]?.categorySummaries,
    ).toEqual([{ categoryId: "00000000-0000-4000-8000-000000000003", name: "지역 현안" }]);
    expect(
      myRoomListResponseSchema.parse({
        items: [{ ...publicRoom, categorySummaries: undefined, ...membershipFields }],
        nextCursor: null,
        hasNext: false,
      }).items[0]?.categoryIds,
    ).toEqual(["00000000-0000-4000-8000-000000000003"]);
    expect(roomInboxListResponseSchema.parse(createRoomInboxPage()).items[0]?.categoryIds).toEqual([
      "00000000-0000-4000-8000-000000000001",
    ]);
    expect(
      roomInboxListResponseSchema.parse(createRoomInboxPage()).items[0]?.categorySummaries,
    ).toEqual([{ categoryId: "00000000-0000-4000-8000-000000000001", name: "정책" }]);
    expect(
      myRoomListResponseSchema.safeParse({
        items: [{ ...publicRoom, categorySummaries: undefined, ...membershipFields }],
        nextCursor: null,
        hasNext: false,
      }).success,
    ).toBe(true);
    expect(
      publicRoomListResponseSchema.safeParse({
        items: [{ ...publicRoom, categorySummaries: undefined }],
        nextCursor: null,
        hasNext: false,
      }).success,
    ).toBe(false);
    expect(
      publicRoomListResponseSchema.safeParse({
        items: [
          {
            ...publicRoom,
            categorySummaries: [
              { categoryId: "00000000-0000-4000-8000-000000000004", name: "환경" },
            ],
          },
        ],
        nextCursor: null,
        hasNext: false,
      }).success,
    ).toBe(false);
    expect(
      publicRoomListResponseSchema.safeParse({
        items: [{ ...publicRoom, categoryIds: undefined }],
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
      categoryIds: ["00000000-0000-4000-8000-000000000002"],
      categorySummaries: [{ categoryId: "00000000-0000-4000-8000-000000000002", name: "환경" }],
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

  it("공개 방 검색 조건을 정규화하고 category ID를 검증한다", () => {
    expect(
      publicRoomListParamsSchema.parse({
        query: "  교통 정책  ",
        categoryId: "00000000-0000-4000-8000-000000000003",
        joinPolicy: "OPEN",
        cursor: "opaque cursor",
        limit: 20,
      }),
    ).toEqual({
      query: "교통 정책",
      categoryId: "00000000-0000-4000-8000-000000000003",
      joinPolicy: "OPEN",
      cursor: "opaque cursor",
      limit: 20,
    });
    expect(publicRoomListParamsSchema.parse({ query: "   " }).query).toBeUndefined();
    expect(publicRoomListParamsSchema.safeParse({ categoryId: "" }).success).toBe(false);
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

  it("Room 메시지 검색어를 서버 정책에 맞춰 정규화하고 길이와 제어 문자를 검증한다", () => {
    expect(normalizeRoomMessageSearchQuery("  ENVIRONMENT\t  POLICYE\u0301  ")).toBe(
      "environment policyé",
    );
    expect(roomMessageSearchQuerySchema.parse(".*")).toBe(".*");
    expect(roomMessageSearchQuerySchema.parse("😀😀")).toBe("😀😀");
    expect(roomMessageSearchQuerySchema.safeParse("가").success).toBe(false);
    expect(roomMessageSearchQuerySchema.safeParse("가".repeat(101)).success).toBe(false);
    expect(roomMessageSearchQuerySchema.safeParse("환경\u0000정책").success).toBe(false);
    expect(roomMessageSearchQuerySchema.safeParse("환경\u0085정책").success).toBe(false);
  });

  it("Room 메시지 검색어 원문을 UTF-16 code unit 기준 512자로 제한한다", () => {
    const normalizationPadding = " ".repeat(510);

    expect(roomMessageSearchQuerySchema.parse(`환경${normalizationPadding}`)).toBe("환경");
    expect(roomMessageSearchQuerySchema.safeParse(`환경${normalizationPadding} `).success).toBe(
      false,
    );
    expect(roomMessageSearchQuerySchema.safeParse(`${"😀".repeat(255)}가나다`).success).toBe(false);
  });

  it("Room 메시지 검색 요청의 nullable cursor와 1~50 limit을 검증한다", () => {
    expect(
      roomMessageSearchRequestSchema.parse({
        query: "  환경   정책  ",
        cursor: null,
        limit: null,
      }),
    ).toEqual({
      query: "환경 정책",
      cursor: null,
      limit: null,
    });
    expect(
      roomMessageSearchRequestSchema.safeParse({ query: "환경", cursor: "cursor-1", limit: 50 })
        .success,
    ).toBe(true);
    expect(roomMessageSearchRequestSchema.safeParse({ query: "환경", limit: 0 }).success).toBe(
      false,
    );
    expect(roomMessageSearchRequestSchema.safeParse({ query: "환경", limit: 51 }).success).toBe(
      false,
    );
  });

  it("Room 메시지 검색 응답의 DESC 정렬과 완료 cursor invariant를 검증한다", () => {
    const schema = createRoomMessageSearchResponseSchema("room-01");

    expect(
      schema.safeParse({
        items: [createMessage(3), createMessage(2)],
        nextCursor: "cursor-1",
        searchComplete: false,
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        items: [],
        nextCursor: "cursor-2",
        searchComplete: false,
      }).success,
    ).toBe(true);
    expect(schema.safeParse({ items: [], nextCursor: null, searchComplete: true }).success).toBe(
      true,
    );
    expect(
      schema.safeParse({
        items: [createMessage(2), createMessage(3)],
        nextCursor: null,
        searchComplete: true,
      }).success,
    ).toBe(false);
    expect(schema.safeParse({ items: [], nextCursor: null, searchComplete: false }).success).toBe(
      false,
    );
    expect(
      schema.safeParse({ items: [], nextCursor: "cursor-1", searchComplete: true }).success,
    ).toBe(false);
  });

  it("Room 메시지 검색 결과를 ACTIVE countable 메시지와 요청 Room으로 제한한다", () => {
    const schema = createRoomMessageSearchResponseSchema("room-01");
    const validPage = {
      items: [createMessage(2)],
      nextCursor: null,
      searchComplete: true,
    };

    expect(
      schema.safeParse({
        ...validPage,
        items: [{ ...createMessage(2), countable: false }],
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...validPage,
        items: [{ ...createMessage(2), roomId: "room-02" }],
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...validPage,
        items: [createDeletedMessage(2)],
      }).success,
    ).toBe(false);
  });

  it("Message Context params와 ASC target invariant를 검증한다", () => {
    expect(roomMessageContextParamsSchema.safeParse({ before: 0, after: 50 }).success).toBe(true);
    expect(roomMessageContextParamsSchema.safeParse({ before: -1 }).success).toBe(false);
    expect(roomMessageContextParamsSchema.safeParse({ after: 51 }).success).toBe(false);

    const schema = createRoomMessageContextResponseSchema("room-01", "message-2");
    const validContext = {
      targetMessageId: "message-2",
      targetRoomSequence: 2,
      items: [createMessage(1), createMessage(2), createMessage(3)],
      nextBeforeSequence: 1,
      nextAfterSequence: 3,
      hasOlder: true,
      hasNewer: true,
    };

    expect(schema.safeParse(validContext).success).toBe(true);
    expect(
      schema.safeParse({
        ...validContext,
        items: [createMessage(2), createMessage(1), createMessage(3)],
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...validContext,
        targetRoomSequence: 3,
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...validContext,
        items: [createMessage(1), createMessage(3)],
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...validContext,
        items: [
          createMessage(1),
          createMessage(2),
          { ...createMessage(3), messageId: "message-2" },
        ],
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...validContext,
        nextBeforeSequence: null,
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...validContext,
        hasOlder: false,
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...validContext,
        nextAfterSequence: null,
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...validContext,
        hasNewer: false,
      }).success,
    ).toBe(false);
  });

  it("Message Context target이 삭제된 경우 tombstone을 허용한다", () => {
    const schema = createRoomMessageContextResponseSchema("room-01", "message-2");

    expect(
      schema.safeParse({
        targetMessageId: "message-2",
        targetRoomSequence: 2,
        items: [createMessage(1), createDeletedMessage(2), createMessage(3)],
        nextBeforeSequence: null,
        nextAfterSequence: null,
        hasOlder: false,
        hasNewer: false,
      }).success,
    ).toBe(true);
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

function createDeletedMessage(roomSequence: number) {
  return {
    ...createMessage(roomSequence),
    content: null,
    state: "DELETED_BY_AUTHOR" as const,
    messageVersion: 2,
    updatedAt: "2026-07-29T05:00:00Z",
    deletedAt: "2026-07-29T05:00:00Z",
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
    categoryIds: ["00000000-0000-4000-8000-000000000001"] as const,
    categorySummaries: [{ categoryId: "00000000-0000-4000-8000-000000000001", name: "정책" }],
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
    categoryIds: ["00000000-0000-4000-8000-000000000001"],
    visibility: "LISTED",
    joinPolicy: "OPEN",
  };
}

function createRoomCreationResponse(state: Record<string, unknown>) {
  return {
    clientRequestId: "b3688817-a610-4ef2-987a-1172945974c7",
    replayed: false,
    creationRequestId: "creation-request-123",
    requestedAt: "2026-08-25T07:00:00Z",
    ...state,
  };
}
