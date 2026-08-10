import { describe, expect, it } from "vitest";
import type { RoomMembershipListItem } from "./chat-room-contracts";
import { createRoomParticipantDisplayNames } from "./chat-room-participant-profiles";

describe("createRoomParticipantDisplayNames", () => {
  it("Backend displayName을 membershipId 기준으로 정규화한다", () => {
    const memberships: readonly RoomMembershipListItem[] = [
      createMembership({ membershipId: "membership-01", displayName: "참여자 1" }),
      createMembership({ membershipId: "membership-02", displayName: "참여자 2" }),
    ];

    expect(createRoomParticipantDisplayNames(memberships)).toEqual(
      new Map([
        ["membership-01", "참여자 1"],
        ["membership-02", "참여자 2"],
      ]),
    );
  });
});

function createMembership(patch: Partial<RoomMembershipListItem> = {}): RoomMembershipListItem {
  return {
    membershipId: "membership-01",
    displayName: "참여자 1",
    imageUrl: null,
    profileVersion: 1,
    role: "MEMBER",
    status: "ACTIVE",
    joinedAt: "2026-08-10T01:00:00Z",
    leftAt: null,
    bannedAt: null,
    version: 1,
    ...patch,
  };
}
