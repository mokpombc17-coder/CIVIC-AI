import { describe, expect, it } from "vitest";
import type { ChatRoomReadReceiptState } from "./chat-room-read-receipt-state";
import {
  resolveChatRoomEntryReadPosition,
  resolveChatRoomStoredReadSequence,
} from "./chat-room-entry-read-position";

function createReceiptState(
  overrides: Partial<ChatRoomReadReceiptState> = {},
): ChatRoomReadReceiptState {
  return {
    generatedAt: "2026-08-10T03:00:00Z",
    positionsByMembershipId: {
      "membership-a": {
        membershipId: "membership-a",
        membershipVersion: 3,
        messageVisibleAfterSequence: 10,
        storedLastReadSequence: 130,
      },
    },
    roomId: "room-01",
    roomVersion: 12,
    selfMembershipId: "membership-a",
    ...overrides,
  };
}

function resolve(overrides: Partial<Parameters<typeof resolveChatRoomEntryReadPosition>[0]> = {}) {
  return resolveChatRoomEntryReadPosition({
    generation: 7,
    latestConfirmedSequence: 150,
    receiptState: createReceiptState(),
    receiptStateReady: true,
    roomId: "room-01",
    selfMembershipId: "membership-a",
    ...overrides,
  });
}

describe("Room entry read position", () => {
  it("저장된 cursor 뒤에 안 읽은 메시지가 있으면 고정된 복원 경계를 만든다", () => {
    const snapshot = resolve();

    expect(snapshot).toEqual({
      dividerAfterSequence: 130,
      entryReadThroughSequence: 130,
      generation: 7,
      messageVisibleAfterSequence: 10,
      mode: "restore",
      roomId: "room-01",
      storedLastReadSequence: 130,
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it("최신 확정 sequence까지 읽었거나 메시지가 없으면 최신 위치를 사용한다", () => {
    expect(resolve({ latestConfirmedSequence: 130 })).toMatchObject({
      entryReadThroughSequence: 130,
      mode: "latest",
    });
    expect(resolve({ latestConfirmedSequence: null })).toMatchObject({
      entryReadThroughSequence: 130,
      mode: "latest",
    });
  });

  it("재참여 접근 경계가 저장 cursor보다 높으면 읽음 구분선 대신 접근 경계를 사용한다", () => {
    const receiptState = createReceiptState({
      positionsByMembershipId: {
        "membership-a": {
          membershipId: "membership-a",
          membershipVersion: 4,
          messageVisibleAfterSequence: 140,
          storedLastReadSequence: 120,
        },
      },
    });

    expect(resolve({ receiptState })).toEqual({
      entryReadThroughSequence: 140,
      generation: 7,
      messageVisibleAfterSequence: 140,
      mode: "visibility-boundary",
      roomId: "room-01",
      storedLastReadSequence: 120,
    });
  });

  it.each([
    {
      expectedReason: "RECEIPT_NOT_READY",
      input: { receiptStateReady: false },
      name: "Receipt가 아직 ready가 아님",
    },
    {
      expectedReason: "RECEIPT_STATE_MISSING",
      input: { receiptState: undefined },
      name: "ready 상태인데 snapshot이 없음",
    },
    {
      expectedReason: "ROOM_MISMATCH",
      input: { receiptState: createReceiptState({ roomId: "room-02" }) },
      name: "Room identity가 다름",
    },
    {
      expectedReason: "SELF_MEMBERSHIP_MISMATCH",
      input: { selfMembershipId: "membership-b" },
      name: "현재 Membership identity가 다름",
    },
    {
      expectedReason: "SELF_POSITION_MISSING",
      input: {
        receiptState: createReceiptState({ positionsByMembershipId: {} }),
      },
      name: "self position이 없음",
    },
  ] as const)("$name이면 복원 위치를 unavailable로 격리한다", ({ expectedReason, input }) => {
    expect(resolve(input)).toEqual({
      generation: 7,
      mode: "unavailable",
      reason: expectedReason,
      roomId: "room-01",
    });
  });

  it("Room generation이 바뀌면 서로 다른 진입 snapshot으로 식별된다", () => {
    expect(resolve({ generation: 7 })).toMatchObject({ generation: 7 });
    expect(resolve({ generation: 8 })).toMatchObject({ generation: 8 });
  });

  it("내 Membership의 서버 저장 읽음 순번만 꺼낸다", () => {
    const input = {
      receiptState: createReceiptState(),
      roomId: "room-01",
      selfMembershipId: "membership-a",
    };

    expect(resolveChatRoomStoredReadSequence(input)).toBe(130);
    expect(resolveChatRoomStoredReadSequence({ ...input, receiptState: undefined })).toBeNull();
    expect(resolveChatRoomStoredReadSequence({ ...input, roomId: "room-02" })).toBeNull();
    expect(resolveChatRoomStoredReadSequence({ ...input, selfMembershipId: null })).toBeNull();
    expect(
      resolveChatRoomStoredReadSequence({ ...input, selfMembershipId: "membership-b" }),
    ).toBeNull();
    expect(
      resolveChatRoomStoredReadSequence({
        ...input,
        receiptState: createReceiptState({ positionsByMembershipId: {} }),
      }),
    ).toBeNull();
  });
});
