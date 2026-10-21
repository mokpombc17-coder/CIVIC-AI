import { describe, expect, it, vi } from "vitest";
import { chatScanCutoff, exportRangeForScan, scanUserChatParticipation } from "./user-activity";

const SERVER_DATE = "Sun, 31 Aug 2026 01:23:45 GMT";

describe("admin user chat participation", () => {
  it("asks each room for the most recent month ending at the room-list server time", async () => {
    const exportBodies: Record<string, unknown>[] = [];
    const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/v1/admin/rooms?limit=50") {
        return Response.json(
          {
            items: [
              adminRoom({ roomId: "room-old", createdAt: "2026-06-01T00:00:00Z" }),
              adminRoom({ roomId: "room-new", createdAt: "2026-08-30T00:00:00Z" }),
            ],
            nextCursor: null,
            hasNext: false,
          },
          { headers: { date: SERVER_DATE } },
        );
      }
      exportBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return Response.json({ code: "INVALID_REQUEST" }, { status: 400 });
    });

    const result = await scanUserChatParticipation("user-1", undefined, request as typeof fetch);

    expect(exportBodies).toEqual([
      { fromInclusive: "2026-08-01T01:23:45.000Z", toExclusive: "2026-08-31T01:23:45.000Z" },
      { fromInclusive: "2026-08-30T00:00:00.000Z", toExclusive: "2026-08-31T01:23:45.000Z" },
    ]);
    expect(result.failedRooms).toBe(2);
  });

  it("keeps every requested range within the Chat export limit of 31 days", () => {
    const range = exportRangeForScan("2020-01-01T00:00:00Z", new Date("2026-08-31T01:23:45.678Z"));

    expect(range).toEqual({
      fromInclusive: "2026-08-01T01:23:45.678Z",
      toExclusive: "2026-08-31T01:23:45.678Z",
    });
    const span = Date.parse(range!.toExclusive) - Date.parse(range!.fromInclusive);
    expect(span).toBeLessThanOrEqual(31 * 24 * 60 * 60 * 1000);
  });

  it("falls back to the recent month when the room creation time is unreadable", () => {
    expect(exportRangeForScan("not-a-date", new Date("2026-08-31T01:23:45.000Z"))).toEqual({
      fromInclusive: "2026-08-01T01:23:45.000Z",
      toExclusive: "2026-08-31T01:23:45.000Z",
    });
  });

  it("skips the export for a room created at or after the cutoff", async () => {
    const request = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/v1/admin/rooms?limit=50") {
        return Response.json(
          {
            items: [adminRoom({ createdAt: "2026-08-31T01:23:45Z" })],
            nextCursor: null,
            hasNext: false,
          },
          { headers: { date: SERVER_DATE } },
        );
      }
      throw new Error(`unexpected request: ${String(input)}`);
    });

    const result = await scanUserChatParticipation("user-1", undefined, request as typeof fetch);

    expect(request).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ scannedRooms: 1, failedRooms: 0, participations: [] });
  });

  it("falls back behind the client clock when the server date is unavailable", () => {
    const fallbackNow = new Date("2026-08-31T01:23:45.000Z");

    expect(chatScanCutoff(null, fallbackNow).toISOString()).toBe("2026-08-31T01:22:45.000Z");
    expect(chatScanCutoff("not-a-date", fallbackNow).toISOString()).toBe(
      "2026-08-31T01:22:45.000Z",
    );
  });
});

function adminRoom(overrides: Readonly<{ roomId?: string; createdAt?: string }> = {}) {
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
    ...overrides,
  };
}
