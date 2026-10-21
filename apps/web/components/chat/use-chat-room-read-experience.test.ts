import { describe, expect, it } from "vitest";
import {
  createReceiptMembershipMismatchRecoveryKey,
  resolveChatRoomReadStateTerminalReason,
} from "./use-chat-room-read-experience";

describe("chat room read experience", () => {
  it("접근 회수와 Room·Membership 종료 신호를 terminal reason으로 분류한다", () => {
    expect(
      resolveChatRoomReadStateTerminalReason({
        connectionErrorCode: "ROOM_ACCESS_REVOKED",
        participationStatus: "ROOM_CLOSED",
        roomErrorCode: "ROOM_CLOSED",
        roomStatus: "CLOSED",
      }),
    ).toBe("ACCESS_REVOKED");

    for (const input of [
      { connectionErrorCode: "ROOM_CLOSED" },
      { roomErrorCode: "ROOM_CLOSED" },
      { roomStatus: "CLOSED" as const },
      { participationStatus: "ROOM_CLOSED" as const },
    ]) {
      expect(
        resolveChatRoomReadStateTerminalReason({
          connectionErrorCode: input.connectionErrorCode ?? null,
          participationStatus: input.participationStatus,
          roomErrorCode: input.roomErrorCode ?? null,
          roomStatus: input.roomStatus,
        }),
      ).toBe("ROOM_CLOSED");
    }

    for (const participationStatus of ["LEFT", "BANNED", "NOT_JOINED"] as const) {
      expect(
        resolveChatRoomReadStateTerminalReason({
          connectionErrorCode: null,
          participationStatus,
          roomErrorCode: null,
          roomStatus: "ACTIVE",
        }),
      ).toBe(participationStatus);
    }

    expect(
      resolveChatRoomReadStateTerminalReason({
        connectionErrorCode: null,
        participationStatus: "ACTIVE",
        roomErrorCode: null,
        roomStatus: "ACTIVE",
      }),
    ).toBeNull();
  });

  it("서로 다른 self membership snapshot만 generation별 복구 key로 만든다", () => {
    const receiptState = {
      generatedAt: "2026-08-10T03:00:00Z",
      positionsByMembershipId: {},
      roomId: "room-01",
      roomVersion: 2,
      selfMembershipId: "membership-stale",
    };

    expect(
      createReceiptMembershipMismatchRecoveryKey({
        generation: 3,
        membershipId: "membership-current",
        receiptState,
      }),
    ).toBe("3:membership-current:membership-stale");
    expect(
      createReceiptMembershipMismatchRecoveryKey({
        generation: 3,
        membershipId: "membership-stale",
        receiptState,
      }),
    ).toBeNull();
    expect(
      createReceiptMembershipMismatchRecoveryKey({
        generation: 3,
        membershipId: null,
        receiptState,
      }),
    ).toBeNull();
  });
});
