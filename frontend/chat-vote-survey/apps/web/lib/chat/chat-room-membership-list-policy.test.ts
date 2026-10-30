import { describe, expect, it } from "vitest";
import { resolveRoomMembershipListPolicy } from "./chat-room-membership-list-policy";

const ACTIVE_ROOM = {
  ownerMembershipId: "membership-owner",
  status: "ACTIVE" as const,
};

describe("Room membership list policy", () => {
  it("일반 ACTIVE 참여자는 ACTIVE 목록만 조회한다", () => {
    const membership = {
      membershipId: "membership-member",
      role: "MEMBER" as const,
      status: "ACTIVE" as const,
    };

    expect(resolveRoomMembershipListPolicy(ACTIVE_ROOM, membership, "ACTIVE")).toEqual({
      enabled: true,
      isOwner: false,
      status: "ACTIVE",
    });
    expect(resolveRoomMembershipListPolicy(ACTIVE_ROOM, membership, "LEFT")).toEqual({
      enabled: true,
      isOwner: false,
      status: "ACTIVE",
    });
    expect(resolveRoomMembershipListPolicy(ACTIVE_ROOM, membership, "BANNED")).toEqual({
      enabled: true,
      isOwner: false,
      status: "ACTIVE",
    });
  });

  it("현재 owner Membership만 요청한 상태 목록을 조회한다", () => {
    const owner = {
      membershipId: "membership-owner",
      role: "OWNER" as const,
      status: "ACTIVE" as const,
    };

    for (const status of ["ACTIVE", "LEFT", "BANNED"] as const) {
      expect(resolveRoomMembershipListPolicy(ACTIVE_ROOM, owner, status)).toEqual({
        enabled: true,
        isOwner: true,
        status,
      });
    }
  });

  it("owner identity가 일치하지 않으면 일반 참여자 정책을 적용한다", () => {
    const staleOwner = {
      membershipId: "membership-previous-owner",
      role: "OWNER" as const,
      status: "ACTIVE" as const,
    };

    expect(resolveRoomMembershipListPolicy(ACTIVE_ROOM, staleOwner, "BANNED")).toEqual({
      enabled: true,
      isOwner: false,
      status: "ACTIVE",
    });
  });

  it("비활성 Membership과 종료된 Room에서는 조회하지 않는다", () => {
    for (const status of ["LEFT", "BANNED"] as const) {
      expect(
        resolveRoomMembershipListPolicy(
          ACTIVE_ROOM,
          {
            membershipId: "membership-member",
            role: "MEMBER",
            status,
          },
          "ACTIVE",
        ).enabled,
      ).toBe(false);
    }

    expect(resolveRoomMembershipListPolicy(ACTIVE_ROOM, null, "ACTIVE").enabled).toBe(false);
    expect(
      resolveRoomMembershipListPolicy(
        { ...ACTIVE_ROOM, status: "CLOSED" },
        {
          membershipId: "membership-owner",
          role: "OWNER",
          status: "ACTIVE",
        },
        "ACTIVE",
      ).enabled,
    ).toBe(false);
  });
});
