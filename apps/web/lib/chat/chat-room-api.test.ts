import { describe, expect, it } from "vitest";
import type { ChatFetch } from "./chat-fetch";
import { ChatRestContractError, createChatRoomApi } from "./chat-room-api";

const IDEMPOTENCY_KEY = "07af9111-3e20-43e5-ae80-78d1bf547647";

describe("chatRoomApi queries", () => {
  it("공개 방, 내 방, inbox, 상세, 내 멤버십과 멤버 목록 경로를 구성한다", async () => {
    const { calls, request } = createQueuedChatFetch(
      {
        items: [PUBLIC_ROOM],
        nextCursor: "next/public cursor",
        hasNext: true,
      },
      {
        items: [MY_ROOM],
        nextCursor: null,
        hasNext: false,
      },
      {
        items: [ROOM_INBOX_ITEM],
        nextCursor: "membership-01",
        hasNext: true,
      },
      ROOM_DETAILS,
      MEMBERSHIP,
      {
        items: [MEMBERSHIP_LIST_ITEM],
        nextCursor: null,
        hasNext: false,
      },
    );
    const api = createChatRoomApi(request);
    const publicRoomsAbortController = new AbortController();

    await api.listPublicRooms(
      {
        query: "  교통 & 환경  ",
        category: "LOCAL_ISSUE",
        joinPolicy: "OPEN",
        cursor: "public cursor",
        limit: 20,
      },
      publicRoomsAbortController.signal,
    );
    await api.listMyRooms({ limit: 100 });
    await api.listRoomInbox({
      cursor: "inbox cursor",
      limit: 20,
    });
    await api.getRoom("room-01");
    await api.getMyMembership("room-01");
    await api.listRoomMemberships("room-01", {
      status: "BANNED",
      cursor: "member cursor",
      limit: 10,
    });

    expect(calls.map(({ path }) => path)).toEqual([
      "/rooms?joinPolicy=OPEN&query=%EA%B5%90%ED%86%B5+%26+%ED%99%98%EA%B2%BD&category=LOCAL_ISSUE&cursor=public+cursor&limit=20",
      "/me/rooms?limit=100",
      "/me/room-inbox?cursor=inbox+cursor&limit=20",
      "/rooms/room-01",
      "/rooms/room-01/memberships/me",
      "/rooms/room-01/memberships?status=BANNED&cursor=member+cursor&limit=10",
    ]);
    expect(calls[0]?.init?.signal).toBe(publicRoomsAbortController.signal);
    expect(calls.slice(1).every(({ init }) => init === undefined)).toBe(true);
  });

  it("응답이 계약과 다르면 endpoint 문맥을 가진 오류를 반환한다", async () => {
    const { request } = createQueuedChatFetch({
      ...ROOM_DETAILS,
      status: "UNKNOWN",
    });
    const api = createChatRoomApi(request);

    const error = await api.getRoom("room-01").catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ChatRestContractError);
    expect(error).toMatchObject({
      contract: "방 상세 응답",
      message: "Chat REST 응답이 방 상세 응답 계약과 일치하지 않습니다.",
    });
  });

  it("유효하지 않은 query와 roomId는 HTTP 요청 전에 거절한다", async () => {
    const { calls, request } = createQueuedChatFetch();
    const api = createChatRoomApi(request);

    await expect(api.listPublicRooms({ limit: 101 })).rejects.toThrow();
    await expect(api.listPublicRooms({ query: "😀".repeat(101) })).rejects.toThrow();
    await expect(api.listPublicRooms({ query: "교통\n정책" })).rejects.toThrow();
    await expect(api.listPublicRooms({ category: "UNKNOWN" as never })).rejects.toThrow();
    await expect(api.listRoomInbox({ limit: 21 })).rejects.toThrow();
    await expect(api.getRoom("invalid room")).rejects.toThrow("roomId 형식이 올바르지 않습니다.");
    expect(calls).toHaveLength(0);
  });

  it("읽음 위치를 Idempotency-Key 없이 PUT하고 응답을 검증한다", async () => {
    const { calls, request } = createQueuedChatFetch({
      roomId: "room-01",
      readThroughSequence: 123,
      updated: true,
    });
    const api = createChatRoomApi(request);

    await expect(api.updateRoomReadState("room-01", { throughSequence: 123 })).resolves.toEqual({
      roomId: "room-01",
      readThroughSequence: 123,
      updated: true,
    });

    expect(calls[0]?.path).toBe("/rooms/room-01/read-state");
    expect(calls[0]?.init?.method).toBe("PUT");
    expect(new Headers(calls[0]?.init?.headers).get("Content-Type")).toBe("application/json");
    expect(new Headers(calls[0]?.init?.headers).has("Idempotency-Key")).toBe(false);
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ throughSequence: 123 });
  });

  it("Room Read Receipt snapshot을 AbortSignal과 함께 조회하고 응답을 검증한다", async () => {
    const response = createRoomReadReceiptStateResponse();
    const { calls, request } = createQueuedChatFetch(response);
    const api = createChatRoomApi(request);
    const abortController = new AbortController();

    await expect(api.getRoomReadReceiptState("room-01", abortController.signal)).resolves.toEqual(
      response,
    );

    expect(calls[0]?.path).toBe("/rooms/room-01/read-receipts/state");
    expect(calls[0]?.init?.signal).toBe(abortController.signal);
    expect(calls[0]?.init?.method).toBeUndefined();
  });
});

describe("chatRoomApi message history", () => {
  it("최신·과거·복구 이력의 query parameter를 구분한다", async () => {
    const { calls, request } = createQueuedChatFetch(
      {
        items: [CHAT_MESSAGE],
        nextBeforeSequence: 119,
        nextAfterSequence: null,
        hasMore: true,
      },
      {
        items: [
          {
            ...CHAT_MESSAGE,
            messageId: "message-70",
            roomSequence: 70,
          },
        ],
        nextBeforeSequence: null,
        nextAfterSequence: null,
        hasMore: false,
      },
      {
        items: [CHAT_MESSAGE],
        nextBeforeSequence: null,
        nextAfterSequence: 120,
        hasMore: true,
      },
    );
    const api = createChatRoomApi(request);

    await api.getRoomMessages("room-01");
    await api.getRoomMessages("room-01", {
      mode: "before",
      beforeSequence: 119,
      limit: 25,
    });
    await api.getRoomMessages("room-01", {
      mode: "after",
      afterSequence: 0,
      limit: 100,
    });

    expect(calls.map(({ path }) => path)).toEqual([
      "/rooms/room-01/messages?limit=50",
      "/rooms/room-01/messages?beforeSequence=119&limit=25",
      "/rooms/room-01/messages?afterSequence=0&limit=100",
    ]);
  });

  it("조회 방향과 다른 cursor 또는 다른 roomId 응답을 거절한다", async () => {
    const { request } = createQueuedChatFetch({
      items: [
        {
          ...CHAT_MESSAGE,
          roomId: "room-02",
        },
      ],
      nextBeforeSequence: null,
      nextAfterSequence: 120,
      hasMore: true,
    });
    const api = createChatRoomApi(request);

    await expect(api.getRoomMessages("room-01")).rejects.toMatchObject({
      name: "ChatRestContractError",
      contract: "latest 메시지 이력 응답",
    });
  });

  it("작성자 삭제 메시지를 목록 위치를 유지한 tombstone으로 파싱한다", async () => {
    const deletedMessage = {
      ...CHAT_MESSAGE,
      content: null,
      state: "DELETED_BY_AUTHOR",
      messageVersion: 2,
      updatedAt: "2026-07-29T05:00:00Z",
      deletedAt: "2026-07-29T05:00:00Z",
    };
    const { request } = createQueuedChatFetch({
      items: [deletedMessage],
      nextBeforeSequence: null,
      nextAfterSequence: null,
      hasMore: false,
    });
    const api = createChatRoomApi(request);

    await expect(api.getRoomMessages("room-01")).resolves.toMatchObject({
      items: [deletedMessage],
    });
  });

  it("유효하지 않은 sequence와 limit은 HTTP 요청 전에 거절한다", async () => {
    const { calls, request } = createQueuedChatFetch();
    const api = createChatRoomApi(request);

    await expect(
      api.getRoomMessages("room-01", {
        mode: "before",
        beforeSequence: 0,
      }),
    ).rejects.toThrow();
    await expect(
      api.getRoomMessages("room-01", {
        mode: "after",
        afterSequence: -1,
        limit: 101,
      }),
    ).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});

describe("chatRoomApi commands", () => {
  it("변경된 Room 설정만 정규화해 update-settings command로 전송한다", async () => {
    const unchangedResponse = {
      ...UPDATE_ROOM_SETTINGS_RESPONSE,
      code: "ROOM_SETTINGS_UNCHANGED",
      replayed: true,
    };
    const { calls, request } = createQueuedChatFetch(
      UPDATE_ROOM_SETTINGS_RESPONSE,
      unchangedResponse,
    );
    const api = createChatRoomApi(request);

    await expect(
      api.updateRoomSettings("room-01", {
        idempotencyKey: IDEMPOTENCY_KEY,
        body: {
          name: "  새로운 방 이름  ",
          description: " \t새로운 설명\n두 번째 줄\r ",
          visibility: "UNLISTED",
        },
      }),
    ).resolves.toEqual(UPDATE_ROOM_SETTINGS_RESPONSE);
    await expect(
      api.updateRoomSettings("room-01", {
        idempotencyKey: IDEMPOTENCY_KEY,
        body: {
          joinPolicy: "INVITE_ONLY",
        },
      }),
    ).resolves.toEqual(unchangedResponse);

    expect(calls.map(({ path }) => path)).toEqual([
      "/rooms/room-01/commands/update-settings",
      "/rooms/room-01/commands/update-settings",
    ]);
    expect(calls.map(({ init }) => init?.method)).toEqual(["POST", "POST"]);
    expect(calls.map(({ init }) => new Headers(init?.headers).get("Idempotency-Key"))).toEqual([
      IDEMPOTENCY_KEY,
      IDEMPOTENCY_KEY,
    ]);
    expect(calls.map(({ init }) => new Headers(init?.headers).get("Content-Type"))).toEqual([
      "application/json",
      "application/json",
    ]);
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      name: "새로운 방 이름",
      description: "새로운 설명\n두 번째 줄",
      visibility: "UNLISTED",
    });
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({
      joinPolicy: "INVITE_ONLY",
    });
  });

  it("유효하지 않은 Room 설정 patch와 roomId는 HTTP 요청 전에 거절한다", async () => {
    const { calls, request } = createQueuedChatFetch();
    const api = createChatRoomApi(request);

    await expect(
      api.updateRoomSettings("room-01", {
        idempotencyKey: IDEMPOTENCY_KEY,
        body: {},
      }),
    ).rejects.toThrow("변경할 방 설정을 하나 이상 입력해야 합니다.");
    await expect(
      api.updateRoomSettings("room-01", {
        idempotencyKey: IDEMPOTENCY_KEY,
        body: {
          description: null,
        } as never,
      }),
    ).rejects.toThrow();
    await expect(
      api.updateRoomSettings("invalid room", {
        idempotencyKey: IDEMPOTENCY_KEY,
        body: {
          description: "",
        },
      }),
    ).rejects.toThrow("roomId 형식이 올바르지 않습니다.");

    expect(calls).toHaveLength(0);
  });

  it("모든 방 command에 method와 Idempotency-Key를 적용한다", async () => {
    const { calls, request } = createQueuedChatFetch(
      CREATE_ROOM_RESPONSE,
      JOIN_ROOM_RESPONSE,
      LEAVE_ROOM_RESPONSE,
      TRANSFER_OWNERSHIP_RESPONSE,
      BAN_MEMBER_RESPONSE,
      UNBAN_MEMBER_RESPONSE,
      CLOSE_ROOM_RESPONSE,
    );
    const api = createChatRoomApi(request);

    await api.createRoom({
      idempotencyKey: IDEMPOTENCY_KEY,
      body: {
        name: "  시민 AI 토론방  ",
        categories: ["POLICY"],
        visibility: "LISTED",
        joinPolicy: "OPEN",
      },
    });
    await api.joinRoom("room-01", {
      idempotencyKey: IDEMPOTENCY_KEY,
      body: undefined,
    });
    await api.leaveRoom("room-01", {
      idempotencyKey: IDEMPOTENCY_KEY,
      body: undefined,
    });
    await api.transferRoomOwnership("room-01", {
      idempotencyKey: IDEMPOTENCY_KEY,
      body: { targetMembershipId: " membership-02 " },
    });
    await api.banRoomMember("room-01", {
      idempotencyKey: IDEMPOTENCY_KEY,
      body: { targetMembershipId: "membership-02" },
    });
    await api.unbanRoomMember("room-01", {
      idempotencyKey: IDEMPOTENCY_KEY,
      body: { targetMembershipId: "membership-02" },
    });
    await api.closeRoom("room-01", {
      idempotencyKey: IDEMPOTENCY_KEY,
      body: undefined,
    });

    expect(calls.map(({ path }) => path)).toEqual([
      "/rooms",
      "/rooms/room-01/commands/join",
      "/rooms/room-01/commands/leave",
      "/rooms/room-01/commands/transfer-ownership",
      "/rooms/room-01/commands/ban-member",
      "/rooms/room-01/commands/unban-member",
      "/rooms/room-01/commands/close",
    ]);

    for (const { init } of calls) {
      expect(init?.method).toBe("POST");
      expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(IDEMPOTENCY_KEY);
    }

    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      name: "시민 AI 토론방",
      description: "",
      categories: ["POLICY"],
      visibility: "LISTED",
      joinPolicy: "OPEN",
    });
    expect(calls[1]?.init?.body).toBeUndefined();
    expect(calls[2]?.init?.body).toBeUndefined();
    expect(JSON.parse(String(calls[3]?.init?.body))).toEqual({
      targetMembershipId: "membership-02",
    });
    expect(JSON.parse(String(calls[4]?.init?.body))).toEqual({
      targetMembershipId: "membership-02",
    });
    expect(JSON.parse(String(calls[5]?.init?.body))).toEqual({
      targetMembershipId: "membership-02",
    });
    expect(calls[6]?.init?.body).toBeUndefined();

    expect(new Headers(calls[0]?.init?.headers).get("Content-Type")).toBe("application/json");
    expect(new Headers(calls[1]?.init?.headers).has("Content-Type")).toBe(false);
  });

  it("호출자가 전달한 idempotency key를 검증하고 그대로 사용한다", async () => {
    const { calls, request } = createQueuedChatFetch(CLOSE_ROOM_RESPONSE);
    const api = createChatRoomApi(request);

    await expect(
      api.closeRoom("room-01", {
        idempotencyKey: "not-a-uuid",
        body: undefined,
      }),
    ).rejects.toThrow();
    expect(calls).toHaveLength(0);

    await api.closeRoom("room-01", {
      idempotencyKey: IDEMPOTENCY_KEY,
      body: undefined,
    });
    expect(new Headers(calls[0]?.init?.headers).get("Idempotency-Key")).toBe(IDEMPOTENCY_KEY);
  });
});

type ChatFetchCall = {
  path: string;
  init: RequestInit | undefined;
};

function createQueuedChatFetch(...responses: unknown[]): {
  calls: ChatFetchCall[];
  request: ChatFetch;
} {
  const calls: ChatFetchCall[] = [];
  const queue = [...responses];
  const request: ChatFetch = async <TResponse>(
    path: string,
    init?: RequestInit,
  ): Promise<TResponse> => {
    calls.push({ path, init });
    return queue.shift() as TResponse;
  };

  return { calls, request };
}

function createRoomReadReceiptStateResponse() {
  return {
    roomId: "room-01",
    roomVersion: 12,
    selfMembershipId: "membership-01",
    positions: [
      {
        membershipId: "membership-01",
        membershipVersion: 3,
        messageVisibleAfterSequence: 0,
        storedLastReadSequence: 130,
      },
    ],
    generatedAt: "2026-08-10T03:00:00Z",
  };
}

const PUBLIC_ROOM = {
  roomId: "room-01",
  name: "시민 AI 토론방",
  description: "",
  categories: ["POLICY"],
  ownerMembershipId: "membership-01",
  status: "ACTIVE",
  visibility: "LISTED",
  joinPolicy: "OPEN",
  activeMemberCount: 2,
  createdAt: "2026-07-29T04:30:00Z",
  version: 2,
};

const MEMBERSHIP = {
  membershipId: "membership-01",
  roomId: "room-01",
  role: "OWNER",
  status: "ACTIVE",
  joinedAt: "2026-07-29T04:30:00Z",
  leftAt: null,
  bannedAt: null,
  version: 1,
};

const ROOM_DETAILS = {
  ...PUBLIC_ROOM,
  closedAt: null,
  participationStatus: "ACTIVE",
  myMembership: MEMBERSHIP,
};

const MY_ROOM = {
  ...PUBLIC_ROOM,
  membershipId: "membership-01",
  membershipRole: "OWNER",
  membershipStatus: "ACTIVE",
  joinedAt: "2026-07-29T04:30:00Z",
  membershipVersion: 1,
};

const ROOM_INBOX_ITEM = {
  ...MY_ROOM,
  readThroughSequence: 123,
  unreadCount: 200,
  unreadCountCapped: false,
  lastMessage: {
    messageId: "message-101",
    roomSequence: 101,
    messageVersion: 2,
    state: "ACTIVE",
    preview: "수정된 메시지",
    previewTruncated: false,
    createdAt: "2026-08-04T08:30:00Z",
  },
  lastActivityAt: "2026-08-04T08:30:00Z",
};

const MEMBERSHIP_LIST_ITEM = {
  membershipId: "membership-02",
  displayName: "참여자 2",
  imageUrl: null,
  profileVersion: 1,
  role: "MEMBER",
  status: "ACTIVE",
  joinedAt: "2026-07-29T04:31:00Z",
  leftAt: null,
  bannedAt: null,
  version: 1,
};

const CREATE_ROOM_RESPONSE = {
  clientRequestId: IDEMPOTENCY_KEY,
  code: "ROOM_CREATED",
  replayed: false,
  roomId: "room-01",
  ownerMembershipId: "membership-01",
  roomVersion: 1,
  ownerMembershipVersion: 1,
};

const UPDATE_ROOM_SETTINGS_RESPONSE = {
  clientRequestId: IDEMPOTENCY_KEY,
  code: "ROOM_SETTINGS_UPDATED",
  replayed: false,
  roomId: "room-01",
  name: "새로운 방 이름",
  description: "새로운 설명\n두 번째 줄",
  categories: ["ENVIRONMENT"],
  visibility: "UNLISTED",
  joinPolicy: "OPEN",
  roomVersion: 8,
};

const JOIN_ROOM_RESPONSE = {
  clientRequestId: IDEMPOTENCY_KEY,
  code: "JOINED",
  replayed: false,
  roomId: "room-01",
  membershipId: "membership-02",
  roomVersion: 2,
  membershipVersion: 1,
};

const LEAVE_ROOM_RESPONSE = {
  ...JOIN_ROOM_RESPONSE,
  code: "LEFT",
};

const TRANSFER_OWNERSHIP_RESPONSE = {
  clientRequestId: IDEMPOTENCY_KEY,
  code: "OWNERSHIP_TRANSFERRED",
  replayed: false,
  roomId: "room-01",
  previousOwnerMembershipId: "membership-01",
  newOwnerMembershipId: "membership-02",
  roomVersion: 3,
  previousOwnerMembershipVersion: 2,
  newOwnerMembershipVersion: 2,
};

const BAN_MEMBER_RESPONSE = {
  clientRequestId: IDEMPOTENCY_KEY,
  code: "BANNED",
  replayed: false,
  roomId: "room-01",
  targetMembershipId: "membership-02",
  roomVersion: 4,
  membershipVersion: 3,
};

const UNBAN_MEMBER_RESPONSE = {
  ...BAN_MEMBER_RESPONSE,
  code: "UNBANNED",
};

const CLOSE_ROOM_RESPONSE = {
  clientRequestId: IDEMPOTENCY_KEY,
  code: "CLOSED",
  replayed: false,
  roomId: "room-01",
  ownerMembershipId: "membership-01",
  roomVersion: 5,
  ownerMembershipVersion: 3,
};

const CHAT_MESSAGE = {
  messageId: "message-120",
  roomId: "room-01",
  roomSequence: 120,
  countable: true,
  senderMembershipId: "membership-01",
  clientMessageId: "ed7d2fe8-996d-4660-822f-e84af1218743",
  content: "안녕하세요.",
  createdAt: "2026-07-29T04:40:00Z",
  deletedAt: null,
  messageVersion: 1,
  state: "ACTIVE",
  updatedAt: "2026-07-29T04:40:00Z",
};
