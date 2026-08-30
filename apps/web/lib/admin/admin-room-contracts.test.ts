import { describe, expect, it } from "vitest";
import { readAdminRoomPage } from "./admin-room-contracts";

describe("admin room contracts", () => {
  it("parses active and closed rooms from the administrator room page", () => {
    expect(
      readAdminRoomPage({
        items: [adminRoom("ACTIVE"), adminRoom("CLOSED")],
        hasNext: false,
      }),
    ).toEqual({
      items: [adminRoom("ACTIVE"), adminRoom("CLOSED")],
      nextCursor: null,
      hasNext: false,
    });
  });

  it("rejects undocumented room states and an unusable cursor page", () => {
    expect(
      readAdminRoomPage({
        items: [{ ...adminRoom("ACTIVE"), status: "ARCHIVED" }],
        hasNext: false,
      }),
    ).toBeNull();
    expect(readAdminRoomPage({ items: [], nextCursor: null, hasNext: true })).toBeNull();
  });
});

function adminRoom(status: "ACTIVE" | "CLOSED") {
  return {
    roomId: "4a52affd-77e8-4bee-86c1-8b74c2ea45ae",
    name: "시민 정책 토론방",
    description: "정책 제안을 논의합니다.",
    categoryIds: ["category-policy"],
    categorySummaries: [{ categoryId: "category-policy", name: "정책" }],
    ownerMembershipId: "membership-owner",
    status,
    visibility: "LISTED",
    joinPolicy: "OPEN",
    activeMemberCount: status === "ACTIVE" ? 4 : 0,
    createdAt: "2026-08-28T00:00:00Z",
    version: status === "ACTIVE" ? 7 : 8,
  };
}
