import { describe, expect, it } from "vitest";
import type { RoomMembershipListItem, RoomParticipationListItem } from "./chat-room-contracts";
import {
  createRoomParticipantDisplayNames,
  createRoomParticipationDisplayNames,
} from "./chat-room-participant-profiles";

describe("createRoomParticipantDisplayNames", () => {
  it("userLabel을 우선 사용하고 미배포 응답은 displayName으로 보완한다", () => {
    const memberships: readonly RoomMembershipListItem[] = [
      createMembership({
        membershipId: "membership-01",
        displayName: "참여자 1",
        userLabel: "owner",
      }),
      createMembership({ membershipId: "membership-02", displayName: "참여자 2" }),
    ];

    expect(createRoomParticipantDisplayNames(memberships)).toEqual(
      new Map([
        ["membership-01", "owner"],
        ["membership-02", "참여자 2"],
      ]),
    );
  });

  it("participation 당시 userLabel을 회차별 이름으로 사용한다", () => {
    const participation = createParticipation({
      displayName: "참여자 15",
      userLabel: "user15",
    });

    expect(createRoomParticipationDisplayNames([participation])).toEqual(
      new Map([["participation-15", "user15"]]),
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

function createParticipation(
  patch: Partial<RoomParticipationListItem> = {},
): RoomParticipationListItem {
  return {
    displayName: "참여자 1",
    endedAfterMessageSequence: null,
    endedAt: null,
    endReason: null,
    enteredAfterMessageSequence: 0,
    imageUrl: null,
    joinedAt: "2026-10-07T10:00:00Z",
    membershipId: "membership-15",
    origin: "NORMAL",
    participationId: "participation-15",
    profileVersion: 1,
    status: "ACTIVE",
    userLabel: "user15",
    version: 1,
    ...patch,
  };
}
