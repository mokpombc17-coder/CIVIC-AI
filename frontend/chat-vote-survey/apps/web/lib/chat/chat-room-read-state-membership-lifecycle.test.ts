import { describe, expect, it } from "vitest";
import { getChatRoomReadStateMembershipLifecycle } from "./chat-room-read-state-membership-lifecycle";

describe("getChatRoomReadStateMembershipLifecycle", () => {
  it("ACTIVE membership과 동기화된 접근 경계로 lifecycle identity를 만든다", () => {
    expect(
      getChatRoomReadStateMembershipLifecycle({
        enabled: true,
        membership: {
          status: "ACTIVE",
          membershipId: "membership-a",
          version: 3,
        },
        messageVisibleAfterSequence: 120,
      }),
    ).toEqual({
      membershipVersion: 3,
      messageVisibleAfterSequence: 120,
      membershipId: "membership-a",
    });
  });

  it.each([
    {
      enabled: false,
      membership: { status: "ACTIVE" as const, membershipId: "membership-a", version: 3 },
      messageVisibleAfterSequence: 120,
    },
    {
      enabled: true,
      membership: null,
      messageVisibleAfterSequence: 120,
    },
    {
      enabled: true,
      membership: { status: "LEFT" as const, membershipId: "membership-a", version: 4 },
      messageVisibleAfterSequence: 120,
    },
    {
      enabled: true,
      membership: { status: "BANNED" as const, membershipId: "membership-a", version: 4 },
      messageVisibleAfterSequence: 120,
    },
    {
      enabled: true,
      membership: { status: "ACTIVE" as const, membershipId: "membership-a", version: 3 },
      messageVisibleAfterSequence: null,
    },
  ])("읽음 보고가 불가능한 상태에서는 lifecycle identity를 만들지 않는다", (input) => {
    expect(getChatRoomReadStateMembershipLifecycle(input)).toBeNull();
  });
});
