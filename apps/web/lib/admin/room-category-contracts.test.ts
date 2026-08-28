import { describe, expect, it } from "vitest";
import {
  readListedRoomPage,
  readRoomCategoryAssignment,
  readRoomCategoryPage,
  readRoomDetailCategorySnapshot,
  sortRoomCategories,
  validateCategorySelection,
} from "./room-category-contracts";

describe("room category contracts", () => {
  it("parses the participant listed-room page used by the admin selector", () => {
    expect(
      readListedRoomPage({
        items: [
          {
            roomId: "room-1",
            name: "시민 정책 토론방",
            categoryIds: ["category-a"],
            activeMemberCount: 4,
            version: 7,
          },
        ],
        nextCursor: "cursor-2",
        hasNext: true,
      }),
    ).toEqual({
      items: [
        {
          roomId: "room-1",
          name: "시민 정책 토론방",
          categoryIds: ["category-a"],
          activeMemberCount: 4,
          version: 7,
        },
      ],
      nextCursor: "cursor-2",
      hasNext: true,
    });
    expect(
      readListedRoomPage({
        items: [],
        nextCursor: null,
        hasNext: true,
      }),
    ).toBeNull();
  });

  it("parses opaque category IDs and sorts a copied list by Korean name", () => {
    const page = readRoomCategoryPage({
      items: [
        {
          categoryId: "category-z",
          name: "환경",
          createdAt: "2026-08-28T01:00:00Z",
          updatedAt: "2026-08-28T01:00:00Z",
          version: 2,
        },
        {
          categoryId: "category-a",
          name: "정책",
          createdAt: "2026-08-28T00:00:00Z",
          updatedAt: "2026-08-28T00:00:00Z",
          version: 0,
        },
      ],
    });

    expect(page?.items.map((item) => item.categoryId)).toEqual(["category-z", "category-a"]);
    expect(sortRoomCategories(page?.items ?? []).map((item) => item.name)).toEqual([
      "정책",
      "환경",
    ]);
    expect(page?.items.map((item) => item.name)).toEqual(["환경", "정책"]);
  });

  it("parses the room version snapshot and category replacement response", () => {
    expect(
      readRoomDetailCategorySnapshot({
        roomId: "room-1",
        categoryIds: ["category-a"],
        version: 7,
      }),
    ).toEqual({ roomId: "room-1", categoryIds: ["category-a"], version: 7 });
    expect(
      readRoomCategoryAssignment({
        roomId: "room-1",
        categoryIds: ["category-a", "category-z"],
        roomVersion: 8,
        changed: true,
      }),
    ).toEqual({
      roomId: "room-1",
      categoryIds: ["category-a", "category-z"],
      roomVersion: 8,
      changed: true,
    });
  });

  it("requires one to five unique category IDs", () => {
    expect(validateCategorySelection([])).toContain("1개 이상");
    expect(validateCategorySelection(["a", "a"])).toContain("중복");
    expect(validateCategorySelection(["1", "2", "3", "4", "5", "6"])).toContain("5개 이하");
    expect(validateCategorySelection(["a", "b"])).toBeNull();
  });
});
