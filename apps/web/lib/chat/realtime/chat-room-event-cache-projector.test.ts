import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { RoomDetails, RoomMembership } from "../chat-room-contracts";
import { chatRoomQueryKeys } from "../chat-room-queries";
import type { ChatRoomEventEnvelope } from "./chat-stomp-contracts";
import {
  applyChatRoomEventCacheProjection,
  createChatRoomEventCacheProjection,
} from "./chat-room-event-cache-projector";

describe("chat room event cache projector", () => {
  it("연속된 멤버 참여 이벤트를 방 version과 참여 인원에 즉시 반영한다", () => {
    const queryClient = createSeededQueryClient();
    const event = createMemberEvent({
      eventId: "event-join",
      eventType: "ROOM_MEMBER_JOINED",
      roomVersion: 2,
      userId: "local-user-2",
      membershipId: "membership-02",
      membershipVersion: 1,
      role: "MEMBER",
      status: "ACTIVE",
    });

    applyChatRoomEventCacheProjection(
      queryClient,
      createChatRoomEventCacheProjection(queryClient, "room-01", [event]),
    );

    expect(
      queryClient.getQueryData<RoomDetails>(chatRoomQueryKeys.detail("room-01")),
    ).toMatchObject({
      activeMemberCount: 2,
      ownerUserId: "local-user-1",
      status: "ACTIVE",
      version: 2,
    });
  });

  it("방장 위임 이벤트를 방장과 현재 사용자의 두 멤버십 cache에 반영한다", () => {
    const queryClient = createSeededQueryClient();
    const event = createOwnershipTransferredEvent();

    applyChatRoomEventCacheProjection(
      queryClient,
      createChatRoomEventCacheProjection(queryClient, "room-01", [event]),
    );

    expect(
      queryClient.getQueryData<RoomDetails>(chatRoomQueryKeys.detail("room-01")),
    ).toMatchObject({
      ownerUserId: "local-user-2",
      version: 2,
      myMembership: {
        role: "MEMBER",
        status: "ACTIVE",
        version: 2,
      },
    });
    expect(
      queryClient.getQueryData<RoomMembership>(chatRoomQueryKeys.myMembership("room-01")),
    ).toMatchObject({
      role: "MEMBER",
      status: "ACTIVE",
      version: 2,
    });
  });

  it("현재 사용자 차단과 방 종료 상태를 즉시 표시하되 version gap에서는 인원을 추정하지 않는다", () => {
    const queryClient = createSeededQueryClient();
    const banned = createMemberEvent({
      eventId: "event-banned",
      eventType: "ROOM_MEMBER_BANNED",
      roomVersion: 4,
      userId: "local-user-1",
      membershipId: "membership-01",
      membershipVersion: 2,
      role: "OWNER",
      status: "BANNED",
    });
    const closed = createOwnerEvent("event-closed", 5);

    applyChatRoomEventCacheProjection(
      queryClient,
      createChatRoomEventCacheProjection(queryClient, "room-01", [banned, closed]),
    );

    expect(
      queryClient.getQueryData<RoomDetails>(chatRoomQueryKeys.detail("room-01")),
    ).toMatchObject({
      activeMemberCount: 0,
      participationStatus: "ROOM_CLOSED",
      status: "CLOSED",
      version: 5,
      myMembership: {
        status: "BANNED",
        version: 2,
      },
    });
  });
});

function createSeededQueryClient(): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  queryClient.setQueryData(chatRoomQueryKeys.detail("room-01"), ROOM_DETAILS);
  queryClient.setQueryData(chatRoomQueryKeys.myMembership("room-01"), MY_MEMBERSHIP);
  return queryClient;
}

function createMemberEvent({
  eventId,
  eventType,
  membershipId,
  membershipVersion,
  role,
  roomVersion,
  status,
  userId,
}: {
  eventId: string;
  eventType:
    | "ROOM_MEMBER_JOINED"
    | "ROOM_MEMBER_REJOINED"
    | "ROOM_MEMBER_LEFT"
    | "ROOM_MEMBER_BANNED"
    | "ROOM_MEMBER_UNBANNED";
  membershipId: string;
  membershipVersion: number;
  role: "OWNER" | "MEMBER";
  roomVersion: number;
  status: "ACTIVE" | "LEFT" | "BANNED";
  userId: string;
}): ChatRoomEventEnvelope {
  return {
    eventVersion: 1,
    eventId,
    eventType,
    emittedAt: "2026-07-30T00:00:00Z",
    payload: {
      roomId: "room-01",
      roomVersion,
      roomStatus: "ACTIVE",
      member: {
        membershipId,
        userId,
        role,
        status,
        membershipVersion,
      },
    },
  };
}

function createOwnershipTransferredEvent(): ChatRoomEventEnvelope {
  return {
    eventVersion: 1,
    eventId: "event-transfer",
    eventType: "ROOM_OWNERSHIP_TRANSFERRED",
    emittedAt: "2026-07-30T00:00:00Z",
    payload: {
      roomId: "room-01",
      roomVersion: 2,
      roomStatus: "ACTIVE",
      previousOwner: {
        membershipId: "membership-01",
        userId: "local-user-1",
        role: "MEMBER",
        status: "ACTIVE",
        membershipVersion: 2,
      },
      newOwner: {
        membershipId: "membership-02",
        userId: "local-user-2",
        role: "OWNER",
        status: "ACTIVE",
        membershipVersion: 2,
      },
    },
  };
}

function createOwnerEvent(eventId: string, roomVersion: number): ChatRoomEventEnvelope {
  return {
    eventVersion: 1,
    eventId,
    eventType: "ROOM_CLOSED",
    emittedAt: "2026-07-30T00:00:00Z",
    payload: {
      roomId: "room-01",
      roomVersion,
      roomStatus: "CLOSED",
      owner: {
        membershipId: "membership-01",
        userId: "local-user-1",
        role: "OWNER",
        status: "BANNED",
        membershipVersion: 2,
      },
    },
  };
}

const MY_MEMBERSHIP = {
  membershipId: "membership-01",
  roomId: "room-01",
  userId: "local-user-1",
  role: "OWNER",
  status: "ACTIVE",
  joinedAt: "2026-07-29T04:30:00Z",
  leftAt: null,
  bannedAt: null,
  version: 1,
} satisfies RoomMembership;

const ROOM_DETAILS = {
  roomId: "room-01",
  name: "시민 AI 토론방",
  description: "",
  ownerUserId: "local-user-1",
  status: "ACTIVE",
  visibility: "LISTED",
  joinPolicy: "OPEN",
  activeMemberCount: 1,
  createdAt: "2026-07-29T04:30:00Z",
  closedAt: null,
  version: 1,
  participationStatus: "ACTIVE",
  myMembership: MY_MEMBERSHIP,
} satisfies RoomDetails;
