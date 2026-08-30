import { describe, expect, it } from "vitest";
import { chatSummaryValue } from "./admin-user-workspace";

describe("admin user chat participation summary", () => {
  it("does not present a failed scan as zero participation", () => {
    expect(
      chatSummaryValue({
        status: "ready",
        result: chatResult({ failedRooms: 4 }),
      }),
    ).toBe("확인 불가");
  });

  it("keeps zero only when every scanned room was checked successfully", () => {
    expect(
      chatSummaryValue({
        status: "ready",
        result: chatResult(),
      }),
    ).toBe("0개");
  });

  it("marks a partial count as a lower bound", () => {
    expect(
      chatSummaryValue({
        status: "ready",
        result: chatResult({
          failedRooms: 1,
          participations: [
            {
              roomId: "room-1",
              roomName: "테스트 토론방",
              roomStatus: "ACTIVE",
              messageCount: 2,
              lastMessageAt: "2026-08-31T01:00:00Z",
            },
          ],
        }),
      }),
    ).toBe("1개 이상");
  });

  it("does not present a truncated empty scan as zero participation", () => {
    expect(
      chatSummaryValue({
        status: "ready",
        result: chatResult({ truncated: true }),
      }),
    ).toBe("확인 불가");
  });
});

function chatResult(
  overrides: Partial<{
    failedRooms: number;
    participations: Array<{
      roomId: string;
      roomName: string;
      roomStatus: string;
      messageCount: number;
      lastMessageAt: string | null;
    }>;
    truncated: boolean;
  }> = {},
) {
  return {
    participations: overrides.participations ?? [],
    scannedRooms: 4,
    totalRooms: 4,
    failedRooms: overrides.failedRooms ?? 0,
    truncated: overrides.truncated ?? false,
  };
}
