import { InfiniteQueryObserver, QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import {
  chatRoomQueryKeys,
  flattenRoomMessageHistoryPages,
  myRoomMembershipQueryOptions,
  myRoomsInfiniteQueryOptions,
  publicRoomsInfiniteQueryOptions,
  roomDetailsQueryOptions,
  roomMessageHistoryInfiniteQueryOptions,
  roomMembershipsInfiniteQueryOptions,
} from "./chat-room-queries";
import type { MessageHistoryResponse } from "./chat-room-contracts";

describe("chat room query options", () => {
  it("공개 방 cursor를 page parameter로 전달하고 query key에서는 제외한다", async () => {
    const listPublicRooms = vi.fn(async () => EMPTY_PAGE);
    const options = publicRoomsInfiniteQueryOptions({ limit: 30 }, { listPublicRooms });
    const queryClient = createQueryClient();

    await queryClient.fetchInfiniteQuery(options);

    expect(options.queryKey).toEqual(chatRoomQueryKeys.publicList(30));
    expect(listPublicRooms).toHaveBeenCalledWith({ limit: 30 });
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

  it("내 방 목록은 기본 limit 20을 사용한다", async () => {
    const listMyRooms = vi.fn(async () => EMPTY_PAGE);
    const options = myRoomsInfiniteQueryOptions({}, { listMyRooms });

    await createQueryClient().fetchInfiniteQuery(options);

    expect(options.queryKey).toEqual(chatRoomQueryKeys.myList(20));
    expect(listMyRooms).toHaveBeenCalledWith({ limit: 20 });
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

    expect(getRoom).toHaveBeenCalledWith("room-01");
    expect(getMyMembership).toHaveBeenCalledWith("room-01");
    expect(chatRoomQueryKeys.detail("room-01")).not.toEqual(
      chatRoomQueryKeys.myMembership("room-01"),
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
    }) => Promise<MessageHistoryResponse>;

    const latestPage = await queryFn({ pageParam: null });
    const nextPageParam = options.getNextPageParam?.(latestPage, [], null, []);

    await queryFn({ pageParam: nextPageParam ?? null });

    expect(getRoomMessages).toHaveBeenNthCalledWith(1, "room-01", {
      mode: "latest",
      limit: 25,
    });
    expect(getRoomMessages).toHaveBeenNthCalledWith(2, "room-01", {
      mode: "before",
      beforeSequence: 119,
      limit: 25,
    });
  });

  it("최신 page부터 저장된 이력을 화면에서는 전체 sequence 오름차순으로 펼친다", () => {
    expect(
      flattenRoomMessageHistoryPages("room-01", [LATEST_MESSAGE_PAGE, OLDER_MESSAGE_PAGE]).map(
        ({ roomSequence }) => roomSequence,
      ),
    ).toEqual([70, 71, 119, 120]);
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

const EMPTY_PAGE = {
  items: [],
  nextCursor: null,
  hasNext: false,
};

const MEMBERSHIP = {
  membershipId: "membership-01",
  roomId: "room-01",
  userId: "local-user-1",
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
  ownerUserId: "local-user-1",
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

function createMessage(roomSequence: number) {
  return {
    messageId: `message-${roomSequence}`,
    roomId: "room-01",
    roomSequence,
    senderUserId: "local-user-1",
    clientMessageId: "ed7d2fe8-996d-4660-822f-e84af1218743",
    content: `메시지 ${roomSequence}`,
    createdAt: "2026-07-29T04:40:00Z",
  };
}
