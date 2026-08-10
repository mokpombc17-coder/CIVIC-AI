import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
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
      ownerMembershipId: "membership-01",
      status: "ACTIVE",
      version: 2,
    });
  });

  it("membershipId로 방장 위임 이벤트의 현재 멤버십을 찾아 cache에 반영한다", () => {
    const queryClient = createSeededQueryClient();
    const event = createOwnershipTransferredEvent();

    applyChatRoomEventCacheProjection(
      queryClient,
      createChatRoomEventCacheProjection(queryClient, "room-01", [event]),
    );

    expect(
      queryClient.getQueryData<RoomDetails>(chatRoomQueryKeys.detail("room-01")),
    ).toMatchObject({
      ownerMembershipId: "membership-02",
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

  it("현재 사용자 차단과 방 종료의 연속된 version을 즉시 반영한다", () => {
    const queryClient = createSeededQueryClient();
    const banned = createMemberEvent({
      eventId: "event-banned",
      eventType: "ROOM_MEMBER_BANNED",
      roomVersion: 2,
      membershipId: "membership-01",
      membershipVersion: 2,
      role: "OWNER",
      status: "BANNED",
    });
    const closed = createOwnerEvent("event-closed", 3);

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
      version: 3,
      myMembership: {
        status: "BANNED",
        version: 2,
      },
    });
  });

  it("연속된 ROOM_SETTINGS_UPDATED의 전체 settings snapshot을 적용한다", () => {
    const queryClient = createSeededQueryClient();
    const event = createSettingsUpdatedEvent({
      eventId: "event-settings",
      roomVersion: 2,
      name: "새 방 이름",
      description: "새 방 설명",
      categories: ["ENVIRONMENT"],
      visibility: "UNLISTED",
      joinPolicy: "INVITE_ONLY",
    });

    const projection = createChatRoomEventCacheProjection(queryClient, "room-01", [event]);
    applyChatRoomEventCacheProjection(queryClient, projection);

    expect(projection).toMatchObject({
      eventsApplied: 1,
      requiresRoomDetailRefetch: false,
    });
    expect(
      queryClient.getQueryData<RoomDetails>(chatRoomQueryKeys.detail("room-01")),
    ).toMatchObject({
      name: "새 방 이름",
      description: "새 방 설명",
      categories: ["ENVIRONMENT"],
      visibility: "UNLISTED",
      joinPolicy: "INVITE_ONLY",
      version: 2,
    });
  });

  it("같은 roomVersion의 설정 이벤트는 eventId가 달라도 다시 적용하지 않는다", () => {
    const queryClient = createSeededQueryClient();
    const first = createSettingsUpdatedEvent({
      eventId: "event-settings-topic",
      roomVersion: 2,
      name: "먼저 적용된 이름",
    });
    const duplicateVersion = createSettingsUpdatedEvent({
      eventId: "event-settings-user-queue",
      roomVersion: 2,
      name: "적용하면 안 되는 이름",
    });

    const projection = createChatRoomEventCacheProjection(queryClient, "room-01", [
      first,
      duplicateVersion,
    ]);
    applyChatRoomEventCacheProjection(queryClient, projection);

    expect(projection.eventsApplied).toBe(1);
    expect(
      queryClient.getQueryData<RoomDetails>(chatRoomQueryKeys.detail("room-01")),
    ).toMatchObject({
      name: "먼저 적용된 이름",
      version: 2,
    });
  });

  it("roomVersion gap이면 부분 snapshot을 적용하지 않고 방 상세 재조회를 요청한다", () => {
    const queryClient = createSeededQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const event = createSettingsUpdatedEvent({
      eventId: "event-settings-gap",
      roomVersion: 3,
      name: "누락 구간 뒤의 이름",
      visibility: "UNLISTED",
    });

    const projection = createChatRoomEventCacheProjection(queryClient, "room-01", [event]);
    applyChatRoomEventCacheProjection(queryClient, projection);

    expect(projection).toMatchObject({
      eventsApplied: 0,
      requiresRoomDetailRefetch: true,
    });
    expect(queryClient.getQueryData<RoomDetails>(chatRoomQueryKeys.detail("room-01"))).toEqual(
      ROOM_DETAILS,
    );
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: chatRoomQueryKeys.detail("room-01"),
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
}): ChatRoomEventEnvelope {
  return {
    eventVersion: 2,
    eventId,
    eventType,
    emittedAt: "2026-07-30T00:00:00Z",
    payload: {
      roomId: "room-01",
      roomVersion,
      roomStatus: "ACTIVE",
      member: {
        membershipId,
        role,
        status,
        membershipVersion,
      },
    },
  };
}

function createOwnershipTransferredEvent(): ChatRoomEventEnvelope {
  return {
    eventVersion: 2,
    eventId: "event-transfer",
    eventType: "ROOM_OWNERSHIP_TRANSFERRED",
    emittedAt: "2026-07-30T00:00:00Z",
    payload: {
      roomId: "room-01",
      roomVersion: 2,
      roomStatus: "ACTIVE",
      previousOwner: {
        membershipId: "membership-01",
        role: "MEMBER",
        status: "ACTIVE",
        membershipVersion: 2,
      },
      newOwner: {
        membershipId: "membership-02",
        role: "OWNER",
        status: "ACTIVE",
        membershipVersion: 2,
      },
    },
  };
}

function createOwnerEvent(eventId: string, roomVersion: number): ChatRoomEventEnvelope {
  return {
    eventVersion: 2,
    eventId,
    eventType: "ROOM_CLOSED",
    emittedAt: "2026-07-30T00:00:00Z",
    payload: {
      roomId: "room-01",
      roomVersion,
      roomStatus: "CLOSED",
      owner: {
        membershipId: "membership-01",
        role: "OWNER",
        status: "BANNED",
        membershipVersion: 2,
      },
    },
  };
}

function createSettingsUpdatedEvent({
  eventId,
  roomVersion,
  name = "시민 AI 토론방",
  description = "",
  categories = ["POLICY"],
  visibility = "LISTED",
  joinPolicy = "OPEN",
}: {
  eventId: string;
  roomVersion: number;
  name?: string;
  description?: string;
  categories?: ("POLICY" | "ENVIRONMENT" | "LOCAL_ISSUE")[];
  visibility?: "LISTED" | "UNLISTED";
  joinPolicy?: "OPEN" | "INVITE_ONLY";
}): ChatRoomEventEnvelope {
  return {
    eventVersion: 2,
    eventId,
    eventType: "ROOM_SETTINGS_UPDATED",
    emittedAt: "2026-07-30T00:00:00Z",
    payload: {
      roomId: "room-01",
      roomVersion,
      roomStatus: "ACTIVE",
      name,
      description,
      categories,
      visibility,
      joinPolicy,
    },
  };
}

const MY_MEMBERSHIP = {
  membershipId: "membership-01",
  roomId: "room-01",
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
  categories: ["POLICY"],
  ownerMembershipId: "membership-01",
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
