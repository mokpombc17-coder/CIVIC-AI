import { InfiniteQueryObserver, QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { ChatApiError } from "./chat-fetch";
import { ChatMessageMergeConflictError } from "./chat-message-merge";
import {
  chatRoomQueryKeys,
  flattenRoomListPages,
  flattenRoomMessageHistoryPages,
  flattenRoomMessageSearchPages,
  getNextRoomInboxPageParam,
  getRoomInboxRetryDelay,
  myRoomCreationRequestQueryOptions,
  myRoomCreationRequestsInfiniteQueryOptions,
  myRoomMembershipQueryOptions,
  myRoomsInfiniteQueryOptions,
  publicRoomsInfiniteQueryOptions,
  recoverPublicRoomInvalidCursorOnce,
  recoverRoomCreationRequestInvalidCursorOnce,
  roomDetailsQueryOptions,
  roomInboxInfiniteQueryOptions,
  roomMessageContextQueryOptions,
  roomMessageHistoryInfiniteQueryOptions,
  roomMessageSearchInfiniteQueryOptions,
  roomMembershipsInfiniteQueryOptions,
  roomReadReceiptStateQueryOptions,
  shouldRetryPublicRoomRequest,
  shouldRetryRoomInboxRequest,
  shouldRetryRoomReadReceiptStateRequest,
} from "./chat-room-queries";
import type { MessageHistoryResponse } from "./chat-room-contracts";

describe("chat room query options", () => {
  it("공개 방 검색 조건을 정규화해 key와 첫 요청에 고정한다", async () => {
    const listPublicRooms = vi.fn(async () => EMPTY_PAGE);
    const options = publicRoomsInfiniteQueryOptions(
      {
        query: "  교통  ",
        categoryId: "00000000-0000-4000-8000-000000000003",
        limit: 30,
      },
      { listPublicRooms },
    );
    const queryClient = createQueryClient();

    await queryClient.fetchInfiniteQuery(options);

    expect(options.queryKey).toEqual(
      chatRoomQueryKeys.publicList({
        query: "교통",
        categoryId: "00000000-0000-4000-8000-000000000003",
        joinPolicy: "OPEN",
        limit: 30,
      }),
    );
    expect(listPublicRooms).toHaveBeenCalledWith(
      {
        query: "교통",
        categoryId: "00000000-0000-4000-8000-000000000003",
        joinPolicy: "OPEN",
        limit: 30,
      },
      expect.any(AbortSignal),
    );
    expect(
      options.getNextPageParam?.(
        {
          items: [],
          nextCursor: "opaque cursor",
          hasNext: true,
        },
        [],
        null,
        [],
      ),
    ).toBe("opaque cursor");
  });

  it("공개 방 검색 조건별 cache를 분리하고 공백 차이는 같은 key로 정규화한다", () => {
    const trimmed = publicRoomsInfiniteQueryOptions({ query: "환경" });
    const padded = publicRoomsInfiniteQueryOptions({ query: "  환경  " });
    const categorized = publicRoomsInfiniteQueryOptions({
      query: "환경",
      categoryId: "00000000-0000-4000-8000-000000000002",
    });

    expect(trimmed.queryKey).toEqual(padded.queryKey);
    expect(trimmed.queryKey).not.toEqual(categorized.queryKey);
  });

  it("공개 방 다음 page에도 같은 검색 조건과 서버 cursor를 전달한다", async () => {
    const listPublicRooms = vi
      .fn()
      .mockResolvedValueOnce({
        items: [],
        nextCursor: "opaque cursor",
        hasNext: true,
      })
      .mockResolvedValueOnce(EMPTY_PAGE);
    const options = publicRoomsInfiniteQueryOptions(
      {
        query: "정책",
        categoryId: "00000000-0000-4000-8000-000000000001",
      },
      { listPublicRooms },
    );
    const observer = new InfiniteQueryObserver(createQueryClient(), options);
    const unsubscribe = observer.subscribe(() => {});

    await vi.waitFor(() => expect(observer.getCurrentResult().hasNextPage).toBe(true));
    await observer.fetchNextPage();

    expect(listPublicRooms).toHaveBeenNthCalledWith(
      2,
      {
        query: "정책",
        categoryId: "00000000-0000-4000-8000-000000000001",
        joinPolicy: "OPEN",
        limit: 20,
        cursor: "opaque cursor",
      },
      expect.any(AbortSignal),
    );

    unsubscribe();
  });

  it("공개 방 다음 page 실패 시 기존 page를 유지한다", async () => {
    const listPublicRooms = vi
      .fn()
      .mockResolvedValueOnce({
        items: [PUBLIC_ROOM_ITEM],
        nextCursor: "opaque cursor",
        hasNext: true,
      })
      .mockRejectedValue(createPublicListError("INTERNAL_ERROR", false, 500));
    const observer = new InfiniteQueryObserver(
      createQueryClient(),
      publicRoomsInfiniteQueryOptions({}, { listPublicRooms }),
    );
    const unsubscribe = observer.subscribe(() => {});

    await vi.waitFor(() => expect(observer.getCurrentResult().hasNextPage).toBe(true));
    await observer.fetchNextPage();

    expect(observer.getCurrentResult().data?.pages).toEqual([
      {
        items: [PUBLIC_ROOM_ITEM],
        nextCursor: "opaque cursor",
        hasNext: true,
      },
    ]);
    expect(observer.getCurrentResult().isFetchNextPageError).toBe(true);

    unsubscribe();
  });

  it("INVALID_CURSOR는 같은 검색 조건에서 page chain을 한 번만 reset한다", async () => {
    const queryClient = createQueryClient();
    let generation: "old" | "new" = "old";
    const listPublicRooms = vi.fn(async (params: { cursor?: string } = {}) => {
      if (generation === "new") {
        return {
          items: [{ ...PUBLIC_ROOM_ITEM, roomId: "room-new" }],
          nextCursor: "cursor-new",
          hasNext: true,
        };
      }

      return params.cursor
        ? {
            items: [{ ...PUBLIC_ROOM_ITEM, roomId: "room-02" }],
            nextCursor: null,
            hasNext: false,
          }
        : {
            items: [PUBLIC_ROOM_ITEM],
            nextCursor: "cursor-old",
            hasNext: true,
          };
    });
    const options = publicRoomsInfiniteQueryOptions({}, { listPublicRooms });
    const queryKey = options.queryKey;
    const observer = new InfiniteQueryObserver(queryClient, options);
    const unsubscribe = observer.subscribe(() => {});
    const resetQueries = vi.spyOn(queryClient, "resetQueries");
    const recovery = { attempted: false };
    const error = createPublicListError("INVALID_CURSOR", false, 400);

    await vi.waitFor(() => expect(observer.getCurrentResult().hasNextPage).toBe(true));
    await observer.fetchNextPage();
    expect(observer.getCurrentResult().data?.pageParams).toEqual([null, "cursor-old"]);

    generation = "new";
    await expect(
      recoverPublicRoomInvalidCursorOnce(queryClient, queryKey, error, recovery),
    ).resolves.toBe(true);
    await expect(
      recoverPublicRoomInvalidCursorOnce(queryClient, queryKey, error, recovery),
    ).resolves.toBe(false);

    expect(resetQueries).toHaveBeenCalledTimes(1);
    expect(resetQueries).toHaveBeenCalledWith({ queryKey, exact: true }, { cancelRefetch: true });
    expect(observer.getCurrentResult().data).toMatchObject({
      pages: [{ items: [{ roomId: "room-new" }] }],
      pageParams: [null],
    });
    expect(listPublicRooms).toHaveBeenLastCalledWith(
      {
        joinPolicy: "OPEN",
        limit: 20,
      },
      expect.any(AbortSignal),
    );

    unsubscribe();
  });

  it("공개 방 목록은 network와 retryable 오류만 한 번 재시도한다", () => {
    expect(shouldRetryPublicRoomRequest(0, new Error("network"))).toBe(true);
    expect(shouldRetryPublicRoomRequest(1, new Error("network"))).toBe(false);
    expect(shouldRetryPublicRoomRequest(0, createPublicListError("SERVER_BUSY", true, 503))).toBe(
      true,
    );
    expect(
      shouldRetryPublicRoomRequest(0, createPublicListError("INVALID_REQUEST", false, 400)),
    ).toBe(false);
    expect(
      shouldRetryPublicRoomRequest(0, createPublicListError("INVALID_CURSOR", false, 400)),
    ).toBe(false);
  });

  it("내 방 목록은 기본 limit 20을 사용한다", async () => {
    const listMyRooms = vi.fn(async () => EMPTY_PAGE);
    const options = myRoomsInfiniteQueryOptions({}, { listMyRooms });

    await createQueryClient().fetchInfiniteQuery(options);

    expect(options.queryKey).toEqual(chatRoomQueryKeys.myList(20));
    expect(listMyRooms).toHaveBeenCalledWith({ limit: 20 });
  });

  it("내 방 생성 신청 이력은 전용 key와 서버 cursor 순서를 사용한다", async () => {
    const listMyRoomCreationRequests = vi.fn(async () => ({
      items: [PENDING_ROOM_CREATION_RESPONSE],
      nextCursor: "creation cursor",
      hasNext: true,
    }));
    const options = myRoomCreationRequestsInfiniteQueryOptions({}, { listMyRoomCreationRequests });

    await createQueryClient().fetchInfiniteQuery(options);

    expect(options.queryKey).toEqual(chatRoomQueryKeys.creationRequestList(20));
    expect(listMyRoomCreationRequests).toHaveBeenCalledWith({ limit: 20 }, expect.any(AbortSignal));
    expect(
      options.getNextPageParam?.(
        {
          items: [],
          nextCursor: "creation cursor",
          hasNext: true,
        },
        [],
        null,
        [],
      ),
    ).toBe("creation cursor");
  });

  it("내 방 생성 신청 cursor가 무효하면 목록을 한 번만 첫 page부터 복구한다", async () => {
    const queryClient = createQueryClient();
    let generation = "old";
    const listMyRoomCreationRequests = vi.fn(async ({ cursor }: { cursor?: string }) => {
      if (cursor) {
        return {
          items: [],
          nextCursor: null,
          hasNext: false,
        };
      }

      return generation === "new"
        ? {
            items: [{ ...PENDING_ROOM_CREATION_RESPONSE, creationRequestId: "request-new" }],
            nextCursor: null,
            hasNext: false,
          }
        : {
            items: [PENDING_ROOM_CREATION_RESPONSE],
            nextCursor: "cursor-old",
            hasNext: true,
          };
    });
    const options = myRoomCreationRequestsInfiniteQueryOptions({}, { listMyRoomCreationRequests });
    const queryKey = options.queryKey;
    const observer = new InfiniteQueryObserver(queryClient, options);
    const unsubscribe = observer.subscribe(() => {});
    const resetQueries = vi.spyOn(queryClient, "resetQueries");
    const recovery = { attempted: false };
    const error = createPublicListError("INVALID_CURSOR", false, 400);

    await vi.waitFor(() => expect(observer.getCurrentResult().hasNextPage).toBe(true));
    generation = "new";

    await expect(
      recoverRoomCreationRequestInvalidCursorOnce(queryClient, queryKey, error, recovery),
    ).resolves.toBe(true);
    await expect(
      recoverRoomCreationRequestInvalidCursorOnce(queryClient, queryKey, error, recovery),
    ).resolves.toBe(false);

    expect(resetQueries).toHaveBeenCalledTimes(1);
    expect(observer.getCurrentResult().data).toMatchObject({
      pages: [{ items: [{ creationRequestId: "request-new" }] }],
      pageParams: [null],
    });

    unsubscribe();
  });

  it("내 방 생성 신청 상세를 신청 ID별 cache로 조회한다", async () => {
    const getMyRoomCreationRequest = vi.fn(async () => PENDING_ROOM_CREATION_RESPONSE);
    const options = myRoomCreationRequestQueryOptions("creation-request-01", {
      getMyRoomCreationRequest,
    });

    await createQueryClient().fetchQuery(options);

    expect(options.queryKey).toEqual(
      chatRoomQueryKeys.creationRequestDetail("creation-request-01"),
    );
    expect(options.staleTime).toBe(0);
    expect(options.refetchOnMount).toBe("always");
    expect(getMyRoomCreationRequest).toHaveBeenCalledWith(
      "creation-request-01",
      expect.any(AbortSignal),
    );
    expect(chatRoomQueryKeys.creationRequestDetail("creation-request-01")).not.toEqual(
      chatRoomQueryKeys.creationRequestDetail("creation-request-02"),
    );
  });

  it("Room inbox는 전용 key와 최대 limit 20을 사용한다", async () => {
    const listRoomInbox = vi.fn(async () => EMPTY_PAGE);
    const options = roomInboxInfiniteQueryOptions({}, { listRoomInbox });

    await createQueryClient().fetchInfiniteQuery(options);

    expect(options.queryKey).toEqual(chatRoomQueryKeys.roomInbox(20));
    expect(listRoomInbox).toHaveBeenCalledWith({ limit: 20 }, expect.any(AbortSignal));
    expect(options.queryKey).not.toEqual(chatRoomQueryKeys.myList(20));
  });

  it("Room inbox는 빈 page여도 hasNext cursor를 사용하고 반복 cursor는 중단한다", () => {
    const page = {
      items: [],
      nextCursor: "membership-20",
      hasNext: true,
    };

    expect(getNextRoomInboxPageParam(page, [], null, [null])).toBe("membership-20");
    expect(getNextRoomInboxPageParam(page, [], "membership-20", [null, "membership-20"])).toBe(
      null,
    );
  });

  it("Room inbox의 retryable 오류만 최대 3회 bounded backoff한다", () => {
    const retryableError = createChatApiError(true);
    const nonRetryableError = createChatApiError(false);

    expect(shouldRetryRoomInboxRequest(0, retryableError)).toBe(true);
    expect(shouldRetryRoomInboxRequest(2, retryableError)).toBe(true);
    expect(shouldRetryRoomInboxRequest(3, retryableError)).toBe(false);
    expect(shouldRetryRoomInboxRequest(0, nonRetryableError)).toBe(false);
    expect(shouldRetryRoomInboxRequest(0, new Error("network"))).toBe(false);
    expect([0, 1, 2, 3].map((attempt) => getRoomInboxRetryDelay(attempt, () => 0.5))).toEqual([
      500, 1_000, 2_000, 2_000,
    ]);
  });

  it("Read Receipt snapshot의 retryable API 오류만 최대 3회 재시도한다", () => {
    const retryableError = createChatApiError(true);
    const nonRetryableError = createChatApiError(false);

    expect(shouldRetryRoomReadReceiptStateRequest(0, retryableError)).toBe(true);
    expect(shouldRetryRoomReadReceiptStateRequest(2, retryableError)).toBe(true);
    expect(shouldRetryRoomReadReceiptStateRequest(3, retryableError)).toBe(false);
    expect(shouldRetryRoomReadReceiptStateRequest(0, nonRetryableError)).toBe(false);
    expect(shouldRetryRoomReadReceiptStateRequest(0, new TypeError("network"))).toBe(false);
  });

  it("여러 cursor page의 방을 서버 순서대로 펼친다", () => {
    expect(
      flattenRoomListPages([
        { items: [{ roomId: "room-01" }, { roomId: "room-02" }] },
        { items: [{ roomId: "room-03" }] },
      ]),
    ).toEqual([{ roomId: "room-01" }, { roomId: "room-02" }, { roomId: "room-03" }]);
  });

  it("방 상세와 내 멤버십을 roomId별로 분리한다", async () => {
    const getRoom = vi.fn(async () => ROOM_DETAILS);
    const getMyMembership = vi.fn(async () => MEMBERSHIP);
    const queryClient = createQueryClient();

    await queryClient.fetchQuery(roomDetailsQueryOptions("room-01", { getRoom }));
    await queryClient.fetchQuery(
      myRoomMembershipQueryOptions("room-01", {
        getMyMembership,
      }),
    );

    expect(getRoom).toHaveBeenCalledWith("room-01", expect.any(AbortSignal));
    expect(getMyMembership).toHaveBeenCalledWith("room-01");
    expect(chatRoomQueryKeys.detail("room-01")).not.toEqual(
      chatRoomQueryKeys.myMembership("room-01"),
    );
  });

  it("Read Receipt snapshot을 generation별 cache로 정규화하고 자동 refetch를 끈다", async () => {
    const getRoomReadReceiptState = vi.fn(async () => READ_RECEIPT_STATE_RESPONSE);
    const options = roomReadReceiptStateQueryOptions(
      "room-01",
      { enabled: true, generation: 7 },
      { getRoomReadReceiptState },
    );
    const queryClient = createQueryClient();

    const state = await queryClient.fetchQuery(options);

    expect(options.queryKey).toEqual(chatRoomQueryKeys.readReceiptState("room-01", 7));
    expect(options.staleTime).toBe(Number.POSITIVE_INFINITY);
    expect(options.refetchOnReconnect).toBe(false);
    expect(options.refetchOnWindowFocus).toBe(false);
    expect(getRoomReadReceiptState).toHaveBeenCalledWith("room-01", expect.any(AbortSignal));
    expect(state.positionsByMembershipId).toEqual({
      "membership-01": READ_RECEIPT_STATE_RESPONSE.positions[0],
    });
    expect(chatRoomQueryKeys.readReceiptState("room-01", 7)).not.toEqual(
      chatRoomQueryKeys.readReceiptState("room-01", 8),
    );
  });

  it("멤버 목록 key와 요청에 status 및 limit을 고정하고 cursor만 페이지별로 전달한다", async () => {
    const listRoomMemberships = vi.fn(async () => EMPTY_PAGE);
    const options = roomMembershipsInfiniteQueryOptions(
      "room-01",
      {
        status: "BANNED",
        limit: 10,
      },
      { listRoomMemberships },
    );

    await createQueryClient().fetchInfiniteQuery(options);

    expect(options.queryKey).toEqual(chatRoomQueryKeys.membershipList("room-01", "BANNED", 10));
    expect(listRoomMemberships).toHaveBeenCalledWith("room-01", {
      status: "BANNED",
      limit: 10,
    });
  });

  it("방장이 아니면 멤버 목록 요청을 시작하지 않을 수 있다", async () => {
    const listRoomMemberships = vi.fn(async () => EMPTY_PAGE);
    const options = roomMembershipsInfiniteQueryOptions(
      "room-01",
      {
        enabled: false,
      },
      { listRoomMemberships },
    );
    const observer = new InfiniteQueryObserver(createQueryClient(), options);
    const unsubscribe = observer.subscribe(() => {});

    await Promise.resolve();

    expect(options.enabled).toBe(false);
    expect(listRoomMemberships).not.toHaveBeenCalled();

    unsubscribe();
  });

  it("메시지 이력은 READY 전 enabled=false에서 요청하지 않는다", async () => {
    const getRoomMessages = vi.fn(async () => LATEST_MESSAGE_PAGE);
    const options = roomMessageHistoryInfiniteQueryOptions(
      "room-01",
      {
        enabled: false,
        limit: 50,
      },
      { getRoomMessages },
    );
    const observer = new InfiniteQueryObserver(createQueryClient(), options);
    const unsubscribe = observer.subscribe(() => {});

    await Promise.resolve();

    expect(options.queryKey).toEqual(chatRoomQueryKeys.messageHistory("room-01", 50));
    expect(options.enabled).toBe(false);
    expect(options.staleTime).toBe(Number.POSITIVE_INFINITY);
    expect(getRoomMessages).not.toHaveBeenCalled();

    unsubscribe();
  });

  it("최초에는 latest를 조회하고 다음 page에는 nextBeforeSequence를 전달한다", async () => {
    const getRoomMessages = vi
      .fn<() => Promise<MessageHistoryResponse>>()
      .mockResolvedValueOnce(LATEST_MESSAGE_PAGE)
      .mockResolvedValueOnce(OLDER_MESSAGE_PAGE);
    const options = roomMessageHistoryInfiniteQueryOptions(
      "room-01",
      {
        enabled: true,
        limit: 25,
      },
      { getRoomMessages },
    );
    const queryFn = options.queryFn as (context: {
      pageParam: number | null;
      signal: AbortSignal;
    }) => Promise<MessageHistoryResponse>;
    const abortController = new AbortController();

    const latestPage = await queryFn({
      pageParam: null,
      signal: abortController.signal,
    });
    const nextPageParam = options.getNextPageParam?.(latestPage, [], null, []);

    await queryFn({
      pageParam: nextPageParam ?? null,
      signal: abortController.signal,
    });

    expect(getRoomMessages).toHaveBeenNthCalledWith(
      1,
      "room-01",
      {
        mode: "latest",
        limit: 25,
      },
      abortController.signal,
    );
    expect(getRoomMessages).toHaveBeenNthCalledWith(
      2,
      "room-01",
      {
        mode: "before",
        beforeSequence: 119,
        limit: 25,
      },
      abortController.signal,
    );
  });

  it("화면 observer가 해제되면 Room inbox·상세·메시지 이력 요청을 취소한다", async () => {
    const queryClient = createQueryClient();
    const signals: AbortSignal[] = [];
    const waitForAbort = (signal: AbortSignal | undefined): Promise<never> => {
      if (!signal) {
        throw new Error("query AbortSignal이 API에 전달되어야 합니다.");
      }

      signals.push(signal);
      return new Promise((_, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    };
    const roomInboxObserver = new InfiniteQueryObserver(
      queryClient,
      roomInboxInfiniteQueryOptions(
        {},
        { listRoomInbox: (_params, signal) => waitForAbort(signal) },
      ),
    );
    const roomDetailsObserver = new QueryObserver(
      queryClient,
      roomDetailsQueryOptions("room-01", { getRoom: (_roomId, signal) => waitForAbort(signal) }),
    );
    const messageHistoryObserver = new InfiniteQueryObserver(
      queryClient,
      roomMessageHistoryInfiniteQueryOptions(
        "room-01",
        { enabled: true },
        { getRoomMessages: (_roomId, _request, signal) => waitForAbort(signal) },
      ),
    );
    const unsubscribes = [
      roomInboxObserver.subscribe(() => {}),
      roomDetailsObserver.subscribe(() => {}),
      messageHistoryObserver.subscribe(() => {}),
    ];

    await vi.waitFor(() => expect(signals).toHaveLength(3));
    unsubscribes.forEach((unsubscribe) => unsubscribe());

    await vi.waitFor(() => expect(signals.every((signal) => signal.aborted)).toBe(true));
  });

  it("최신 page부터 저장된 이력을 화면에서는 전체 sequence 오름차순으로 펼친다", () => {
    expect(
      flattenRoomMessageHistoryPages("room-01", [LATEST_MESSAGE_PAGE, OLDER_MESSAGE_PAGE]).map(
        ({ roomSequence }) => roomSequence,
      ),
    ).toEqual([70, 71, 119, 120]);
  });

  it("page 경계에서 겹친 메시지는 최신 page의 높은 version snapshot으로 교체한다", () => {
    const originalMessage = createMessage(70);
    const updatedMessage = {
      ...originalMessage,
      content: "수정된 메시지 70",
      messageVersion: 2,
      updatedAt: "2026-07-29T04:41:00Z",
    };

    expect(
      flattenRoomMessageHistoryPages("room-01", [
        createMessagePage([updatedMessage, createMessage(71)]),
        createMessagePage([originalMessage]),
      ]),
    ).toEqual([updatedMessage, createMessage(71)]);
  });

  it("page 경계에서 같은 sequence에 다른 messageId가 있으면 충돌로 처리한다", () => {
    const conflictingMessage = {
      ...createMessage(70),
      messageId: "another-message-70",
      clientMessageId: "03c02813-df0e-4f5f-809c-9a21f940446d",
    };

    expect(() =>
      flattenRoomMessageHistoryPages("room-01", [
        createMessagePage([conflictingMessage]),
        createMessagePage([createMessage(70)]),
      ]),
    ).toThrowError(
      expect.objectContaining<Partial<ChatMessageMergeConflictError>>({
        code: "ROOM_SEQUENCE_CONFLICT",
      }),
    );
  });

  it("page 순서가 계약과 다르면 기존 범용 merge로 정렬한다", () => {
    expect(
      flattenRoomMessageHistoryPages("room-01", [
        createMessagePage([createMessage(50)]),
        createMessagePage([createMessage(70)]),
      ]).map(({ roomSequence }) => roomSequence),
    ).toEqual([50, 70]);
  });

  it("메시지 검색 조건을 정규화해 generation별 key와 첫 요청에 고정한다", async () => {
    const searchRoomMessages = vi.fn(async () => ({
      items: [],
      nextCursor: null,
      searchComplete: true,
    }));
    const options = roomMessageSearchInfiniteQueryOptions(
      "room-01",
      {
        enabled: true,
        generation: 4,
        query: "  Env　POLICY  ",
        limit: 30,
      },
      { searchRoomMessages },
    );

    await createQueryClient().fetchInfiniteQuery(options);

    expect(options.queryKey).toEqual(
      chatRoomQueryKeys.messageSearch("room-01", {
        generation: 4,
        sessionGeneration: 0,
        query: "env policy",
        limit: 30,
      }),
    );
    expect(searchRoomMessages).toHaveBeenCalledWith(
      "room-01",
      {
        query: "env policy",
        cursor: null,
        limit: 30,
      },
      expect.any(AbortSignal),
    );
  });

  it("빈 중간 검색 page도 continuation cursor로 같은 session을 이어간다", async () => {
    const searchRoomMessages = vi
      .fn()
      .mockResolvedValueOnce({
        items: [],
        nextCursor: "opaque cursor",
        searchComplete: false,
      })
      .mockResolvedValueOnce({
        items: [createSearchMessage(80)],
        nextCursor: null,
        searchComplete: true,
      });
    const options = roomMessageSearchInfiniteQueryOptions(
      "room-01",
      {
        enabled: true,
        generation: 2,
        query: "환경 정책",
      },
      { searchRoomMessages },
    );
    const observer = new InfiniteQueryObserver(createQueryClient(), options);
    const unsubscribe = observer.subscribe(() => {});

    await vi.waitFor(() => expect(observer.getCurrentResult().hasNextPage).toBe(true));
    await observer.fetchNextPage();

    expect(searchRoomMessages).toHaveBeenNthCalledWith(
      2,
      "room-01",
      {
        query: "환경 정책",
        cursor: "opaque cursor",
        limit: 20,
      },
      expect.any(AbortSignal),
    );
    expect(observer.getCurrentResult().hasNextPage).toBe(false);

    unsubscribe();
  });

  it("검색 page를 messageId로 중복 제거하고 roomSequence 내림차순으로 펼친다", () => {
    const firstVersion = createSearchMessage(90);
    const duplicateVersion = {
      ...firstVersion,
      content: "중복 page의 메시지",
      messageVersion: 2,
    };

    expect(
      flattenRoomMessageSearchPages([
        {
          items: [createSearchMessage(120), firstVersion],
          nextCursor: "opaque cursor",
          searchComplete: false,
        },
        {
          items: [duplicateVersion, createSearchMessage(70)],
          nextCursor: null,
          searchComplete: true,
        },
      ]),
    ).toEqual([createSearchMessage(120), firstVersion, createSearchMessage(70)]);
  });

  it("Context query를 generation과 window로 격리하고 기본 window를 전달한다", async () => {
    const target = createMessage(120);
    const response = {
      targetMessageId: target.messageId,
      targetRoomSequence: target.roomSequence,
      items: [target],
      nextBeforeSequence: null,
      nextAfterSequence: null,
      hasOlder: false,
      hasNewer: false,
    };
    const getRoomMessageContext = vi.fn(async () => response);
    const options = roomMessageContextQueryOptions(
      "room-01",
      target.messageId,
      { enabled: true, generation: 3 },
      { getRoomMessageContext },
    );

    await createQueryClient().fetchQuery(options);

    expect(options.queryKey).toEqual(
      chatRoomQueryKeys.messageContext("room-01", target.messageId, 3, 20, 20),
    );
    expect(getRoomMessageContext).toHaveBeenCalledWith(
      "room-01",
      target.messageId,
      { before: 20, after: 20 },
      expect.any(AbortSignal),
    );
  });
});

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function createChatApiError(retryable: boolean): ChatApiError {
  return new ChatApiError(503, "Service Unavailable", "http://localhost/api/v1/me/room-inbox", {
    type: "urn:hamcheeze:problem:room-inbox-unavailable",
    title: "Room inbox unavailable",
    status: 503,
    detail: "Room inbox is temporarily unavailable.",
    instance: "/api/v1/me/room-inbox",
    code: "ROOM_INBOX_UNAVAILABLE",
    replayed: false,
    retryable,
  });
}

function createPublicListError(code: string, retryable: boolean, status: number): ChatApiError {
  return new ChatApiError(status, "Request failed", "http://localhost/api/v1/rooms", {
    type: `urn:hamcheeze:problem:${code.toLowerCase().replaceAll("_", "-")}`,
    title: "Public Room list request failed",
    status,
    detail: "Public Room list request failed.",
    instance: "/api/v1/rooms",
    code,
    replayed: false,
    retryable,
  });
}

const PUBLIC_ROOM_ITEM = {
  roomId: "room-01",
  name: "공개 채팅방",
  description: "설명",
  categoryIds: ["00000000-0000-4000-8000-000000000001" as const],
  categorySummaries: [{ categoryId: "00000000-0000-4000-8000-000000000001", name: "정책" }],
  ownerMembershipId: "membership-owner",
  status: "ACTIVE" as const,
  visibility: "LISTED" as const,
  joinPolicy: "OPEN" as const,
  activeMemberCount: 1,
  createdAt: "2026-08-06T00:00:00Z",
  version: 1,
};

const PENDING_ROOM_CREATION_RESPONSE = {
  clientRequestId: "07af9111-3e20-43e5-ae80-78d1bf547647",
  code: "ROOM_CREATION_REQUESTED" as const,
  replayed: false,
  creationRequestId: "creation-request-01",
  name: "시민 AI 토론방",
  status: "PENDING" as const,
  roomStatus: null,
  requestedAt: "2026-08-25T07:00:00Z",
  resolvedAt: null,
  roomId: null,
  ownerMembershipId: null,
  roomVersion: null,
  ownerMembershipVersion: null,
  rejectionReason: null,
};

const EMPTY_PAGE = {
  items: [],
  nextCursor: null,
  hasNext: false,
};

const MEMBERSHIP = {
  membershipId: "membership-01",
  roomId: "room-01",
  role: "OWNER" as const,
  status: "ACTIVE" as const,
  joinedAt: "2026-07-29T04:30:00Z",
  leftAt: null,
  bannedAt: null,
  version: 1,
};

const ROOM_DETAILS = {
  roomId: "room-01",
  name: "시민 AI 토론방",
  description: "",
  categoryIds: ["00000000-0000-4000-8000-000000000001" as const],
  categorySummaries: [{ categoryId: "00000000-0000-4000-8000-000000000001", name: "정책" }],
  ownerMembershipId: "membership-01",
  status: "ACTIVE" as const,
  visibility: "LISTED" as const,
  joinPolicy: "OPEN" as const,
  activeMemberCount: 1,
  createdAt: "2026-07-29T04:30:00Z",
  closedAt: null,
  version: 1,
  participationStatus: "ACTIVE" as const,
  myMembership: MEMBERSHIP,
};

const READ_RECEIPT_STATE_RESPONSE = {
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

const LATEST_MESSAGE_PAGE = {
  items: [createMessage(119), createMessage(120)],
  nextBeforeSequence: 119,
  nextAfterSequence: null,
  hasMore: true,
} satisfies MessageHistoryResponse;

const OLDER_MESSAGE_PAGE = {
  items: [createMessage(70), createMessage(71)],
  nextBeforeSequence: null,
  nextAfterSequence: null,
  hasMore: false,
} satisfies MessageHistoryResponse;

function createMessagePage(items: MessageHistoryResponse["items"]): MessageHistoryResponse {
  return {
    items,
    nextBeforeSequence: null,
    nextAfterSequence: null,
    hasMore: false,
  };
}

function createMessage(roomSequence: number) {
  return {
    messageId: `message-${roomSequence}`,
    roomId: "room-01",
    roomSequence,
    countable: true,
    senderMembershipId: "membership-01",
    clientMessageId: "ed7d2fe8-996d-4660-822f-e84af1218743",
    content: `메시지 ${roomSequence}`,
    createdAt: "2026-07-29T04:40:00Z",
    deletedAt: null,
    messageVersion: 1,
    state: "ACTIVE" as const,
    updatedAt: "2026-07-29T04:40:00Z",
  };
}

function createSearchMessage(roomSequence: number) {
  return {
    ...createMessage(roomSequence),
    countable: true as const,
  };
}
