import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  getLatestCachedRoomParticipationHistory,
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

  it("활성 상태로 연결된 방에서만 메시지 내역을 조회한다", () => {
    expect(isChatRoomMessageHistoryEnabled("CLOSED", false)).toBe(false);
    expect(isChatRoomMessageHistoryEnabled("ACTIVE", true)).toBe(true);
    expect(isChatRoomMessageHistoryEnabled("ACTIVE", false)).toBe(false);
    expect(isChatRoomMessageHistoryEnabled(undefined, false)).toBe(false);
  });

  it("비활성 generation에서도 같은 방의 최신 participation 캐시를 사용한다", () => {
    const queryClient = new QueryClient();
    const previousItems = [{ participationId: "participation-01" }] as never;
    const latestItems = [{ participationId: "participation-02" }] as never;
    queryClient.setQueryData(
      ["chat", "rooms", "participation", "room-01", { generation: 7 }],
      { items: previousItems },
      { updatedAt: 100 },
    );
    queryClient.setQueryData(
      ["chat", "rooms", "participation", "room-02", { generation: 8 }],
      { items: [{ participationId: "other-room" }] },
      { updatedAt: 300 },
    );
    queryClient.setQueryData(
      ["chat", "rooms", "participation", "room-01", { generation: 9 }],
      { items: latestItems },
      { updatedAt: 200 },
    );

    expect(getLatestCachedRoomParticipationHistory(queryClient, "room-01")).toBe(latestItems);
    expect(getLatestCachedRoomParticipationHistory(queryClient, "room-03")).toEqual([]);
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
