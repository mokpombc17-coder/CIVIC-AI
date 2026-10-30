import { describe, expect, it } from "vitest";
import { normalizeRoomReadReceiptState } from "./chat-room-read-receipt-state";

describe("Room Read Receipt state", () => {
  it("REST positions를 membershipId key의 cache model로 정규화한다", () => {
    expect(
      normalizeRoomReadReceiptState({
        roomId: "room-01",
        roomVersion: 12,
        selfMembershipId: "membership-a",
        positions: [
          {
            membershipId: "membership-a",
            membershipVersion: 3,
            messageVisibleAfterSequence: 0,
            storedLastReadSequence: 130,
          },
          {
            membershipId: "membership-b",
            membershipVersion: 2,
            messageVisibleAfterSequence: 100,
            storedLastReadSequence: 118,
          },
        ],
        generatedAt: "2026-08-10T03:00:00Z",
      }),
    ).toEqual({
      roomId: "room-01",
      roomVersion: 12,
      selfMembershipId: "membership-a",
      positionsByMembershipId: {
        "membership-a": {
          membershipId: "membership-a",
          membershipVersion: 3,
          messageVisibleAfterSequence: 0,
          storedLastReadSequence: 130,
        },
        "membership-b": {
          membershipId: "membership-b",
          membershipVersion: 2,
          messageVisibleAfterSequence: 100,
          storedLastReadSequence: 118,
        },
      },
      generatedAt: "2026-08-10T03:00:00Z",
    });
  });
});
