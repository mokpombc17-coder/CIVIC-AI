import { describe, expect, it } from "vitest";
import { isChatRoomSnapshotReadyForRealtimeMerge } from "./chat-room-snapshot-readiness";

describe("isChatRoomSnapshotReadyForRealtimeMerge", () => {
  it("활성 방의 최신 REST snapshot 조회가 끝난 뒤에만 준비된다", () => {
    expect(
      isChatRoomSnapshotReadyForRealtimeMerge({
        hasMessageHistory: true,
        isMessageHistoryRefetching: false,
        isRoomActive: true,
        messageHistoryStatus: "success",
      }),
    ).toBe(true);
  });

  it.each([
    {
      name: "방 구독 준비 전",
      input: {
        hasMessageHistory: true,
        isMessageHistoryRefetching: false,
        isRoomActive: false,
        messageHistoryStatus: "success" as const,
      },
    },
    {
      name: "메시지 이력 요청 중",
      input: {
        hasMessageHistory: false,
        isMessageHistoryRefetching: false,
        isRoomActive: true,
        messageHistoryStatus: "pending" as const,
      },
    },
    {
      name: "메시지 이력 요청 실패",
      input: {
        hasMessageHistory: false,
        isMessageHistoryRefetching: false,
        isRoomActive: true,
        messageHistoryStatus: "error" as const,
      },
    },
    {
      name: "기존 cache의 최신 snapshot 재조회 중",
      input: {
        hasMessageHistory: true,
        isMessageHistoryRefetching: true,
        isRoomActive: true,
        messageHistoryStatus: "success" as const,
      },
    },
  ])("$name 상태에서는 준비되지 않는다", ({ input }) => {
    expect(isChatRoomSnapshotReadyForRealtimeMerge(input)).toBe(false);
  });
});
