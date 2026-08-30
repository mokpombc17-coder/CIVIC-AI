import { describe, expect, it, vi } from "vitest";
import { chatScanCutoff, exportRangeForScan, scanUserChatParticipation } from "./user-activity";

const SERVER_DATE = "Sun, 31 Aug 2026 01:23:45 GMT";

describe("admin user chat participation", () => {
  it("uses the room-list server time as the conversation export cutoff", async () => {
    let exportBody: Record<string, unknown> | null = null;
    const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/v1/admin/rooms?limit=50") {
        return Response.json(
          { items: [adminRoom()], nextCursor: null, hasNext: false },
          { headers: { date: SERVER_DATE } },
        );
      }
      exportBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({ code: "INVALID_REQUEST" }, { status: 400 });
    });

    const result = await scanUserChatParticipation("user-1", undefined, request as typeof fetch);

    expect(exportBody).toEqual({
      fromInclusive: "2020-01-01T00:00:00.000Z",
      toExclusive: "2026-08-31T01:23:45.000Z",
    });
    expect(result.failedRooms).toBe(1);
  });

  it("never adds a future day to an explicitly supplied cutoff", () => {
    expect(exportRangeForScan(new Date("2026-08-31T01:23:45.678Z"))).toEqual({
      fromInclusive: "2020-01-01T00:00:00.000Z",
      toExclusive: "2026-08-31T01:23:45.678Z",
    });
  });

  it("falls back behind the client clock when the server date is unavailable", () => {
    const fallbackNow = new Date("2026-08-31T01:23:45.000Z");

    expect(chatScanCutoff(null, fallbackNow).toISOString()).toBe("2026-08-31T01:22:45.000Z");
    expect(chatScanCutoff("not-a-date", fallbackNow).toISOString()).toBe(
      "2026-08-31T01:22:45.000Z",
    );
  });
});

function adminRoom() {
  return {
    roomId: "room-1",
    name: "테스트 토론방",
    description: "대화 기록 집계 테스트",
    categoryIds: [],
    categorySummaries: [],
    ownerMembershipId: "membership-1",
    status: "ACTIVE",
    visibility: "LISTED",
    joinPolicy: "OPEN",
    activeMemberCount: 1,
    createdAt: "2026-08-30T00:00:00Z",
    version: 1,
  };
}
