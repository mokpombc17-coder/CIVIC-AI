import { describe, expect, it } from "vitest";
import {
  isChatRoomMessageHistoryEnabled,
  isChatRoomRealtimeCoordinatorEnabled,
  isChatRoomRealtimeEnabled,
  isChatRoomRealtimeReady,
} from "./use-chat-room-realtime-experience";

describe("ChatRoom realtime experience", () => {
  const readySnapshot = {
    hasMessageHistory: true,
    isMessageHistoryRefetching: false,
    isRoomActive: true,
    messageHistoryStatus: "success" as const,
    messageVisibleAfterSequence: 0,
    watermarkSequence: 12,
  };

  it("활성 방에만 실시간 구독을 연결한다", () => {
    expect(isChatRoomRealtimeEnabled("ACTIVE")).toBe(true);
    expect(isChatRoomRealtimeEnabled("CLOSED")).toBe(false);
    expect(isChatRoomRealtimeEnabled(undefined)).toBe(false);
  });

  it("종료된 방은 실시간 구독 없이도 메시지 내역을 조회한다", () => {
    expect(isChatRoomMessageHistoryEnabled("CLOSED", false)).toBe(true);
    expect(isChatRoomMessageHistoryEnabled("ACTIVE", true)).toBe(true);
    expect(isChatRoomMessageHistoryEnabled("ACTIVE", false)).toBe(false);
    expect(isChatRoomMessageHistoryEnabled(undefined, false)).toBe(false);
  });

  it("활성 Room의 sequence와 message snapshot이 모두 준비되면 coordinator를 연다", () => {
    expect(isChatRoomRealtimeCoordinatorEnabled(readySnapshot)).toBe(true);
  });

  it.each([
    { messageVisibleAfterSequence: null },
    { watermarkSequence: null },
    { hasMessageHistory: false },
    { isMessageHistoryRefetching: true },
    { isRoomActive: false },
    { messageHistoryStatus: "pending" as const },
    { messageHistoryStatus: "error" as const },
  ])("필수 snapshot 경계가 준비되지 않으면 coordinator를 열지 않는다", (patch) => {
    expect(
      isChatRoomRealtimeCoordinatorEnabled({
        ...readySnapshot,
        ...patch,
      }),
    ).toBe(false);
  });

  it("활성 coordinator가 동기화되고 오류가 없을 때만 realtime ready다", () => {
    expect(
      isChatRoomRealtimeReady({
        coordinatorEnabled: true,
        coordinatorError: null,
        isSynchronized: true,
      }),
    ).toBe(true);

    expect(
      isChatRoomRealtimeReady({
        coordinatorEnabled: false,
        coordinatorError: null,
        isSynchronized: true,
      }),
    ).toBe(false);
    expect(
      isChatRoomRealtimeReady({
        coordinatorEnabled: true,
        coordinatorError: new Error("merge failed"),
        isSynchronized: true,
      }),
    ).toBe(false);
    expect(
      isChatRoomRealtimeReady({
        coordinatorEnabled: true,
        coordinatorError: null,
        isSynchronized: false,
      }),
    ).toBe(false);
  });
});
