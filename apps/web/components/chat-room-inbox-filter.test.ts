import { describe, expect, it } from "vitest";
import type { RoomInboxListItem } from "@/lib/chat/chat-room-contracts";
import { filterLoadedRoomInboxItems } from "./chat-room-inbox-filter";

describe("loaded Room inbox filter", () => {
  const rooms = [createRoom("room-read", 0), createRoom("room-unread", 3)];

  it("ALL은 누적 목록과 순서를 그대로 유지한다", () => {
    expect(filterLoadedRoomInboxItems(rooms, "ALL")).toBe(rooms);
  });

  it("UNREAD는 unreadCount가 양수인 누적 항목만 유지한다", () => {
    expect(filterLoadedRoomInboxItems(rooms, "UNREAD").map((room) => room.roomId)).toEqual([
      "room-unread",
    ]);
  });
});

function createRoom(roomId: string, unreadCount: number): RoomInboxListItem {
  return {
    roomId,
    name: roomId,
    description: "",
    categoryIds: ["00000000-0000-4000-8000-000000000001"],
    categorySummaries: [{ categoryId: "00000000-0000-4000-8000-000000000001", name: "정책" }],
    ownerMembershipId: "membership-owner",
    status: "ACTIVE",
    visibility: "LISTED",
    joinPolicy: "OPEN",
    activeMemberCount: 1,
    createdAt: "2026-08-25T00:00:00Z",
    version: 1,
    membershipId: `membership-${roomId}`,
    membershipRole: "MEMBER",
    membershipStatus: "ACTIVE",
    joinedAt: "2026-08-25T00:00:00Z",
    membershipVersion: 1,
    readThroughSequence: 0,
    unreadCount,
    unreadCountCapped: false,
    lastMessage: null,
    lastActivityAt: "2026-08-25T00:00:00Z",
  };
}
