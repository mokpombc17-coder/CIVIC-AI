import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import {
  chatRoomQueryKeys,
  myRoomMembershipQueryOptions,
  myRoomsInfiniteQueryOptions,
  publicRoomsInfiniteQueryOptions,
  roomDetailsQueryOptions,
  roomMembershipsInfiniteQueryOptions,
} from "./chat-room-queries";

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
