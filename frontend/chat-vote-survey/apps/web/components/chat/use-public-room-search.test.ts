import { describe, expect, it } from "vitest";
import {
  INITIAL_PUBLIC_ROOM_SEARCH_STATE,
  PUBLIC_ROOM_SEARCH_APPLY_MODE,
  PUBLIC_ROOM_SEARCH_DEBOUNCE_DELAY_MS,
  reducePublicRoomSearchState,
  type PublicRoomSearchAction,
  type PublicRoomSearchState,
} from "@/components/chat/use-public-room-search";

describe("public Room search state", () => {
  it("초기 정책은 debounce 없이 검색 제출로만 적용한다", () => {
    expect(PUBLIC_ROOM_SEARCH_APPLY_MODE).toBe("submit");
    expect(PUBLIC_ROOM_SEARCH_DEBOUNCE_DELAY_MS).toBe(300);

    const state = reduce([
      {
        type: "draft-changed",
        value: "환경",
      },
    ]);

    expect(state.draftQuery).toBe("환경");
    expect(state.appliedQuery).toBeUndefined();
  });

  it("검색 제출 시 draft를 정규화해 applied query로 전환한다", () => {
    const state = reduce([
      { type: "draft-changed", value: "  지역 교통  " },
      { type: "submitted" },
    ]);

    expect(state.draftQuery).toBe("  지역 교통  ");
    expect(state.appliedQuery).toBe("지역 교통");
    expect(state.validationMessage).toBeUndefined();
  });

  it("잘못된 검색어는 기존 적용 조건을 유지하고 validation을 반환한다", () => {
    const valid = reduce([{ type: "draft-changed", value: "환경" }, { type: "submitted" }]);
    const invalid = reduce(
      [{ type: "draft-changed", value: "환경\n정책" }, { type: "submitted" }],
      valid,
    );

    expect(invalid.appliedQuery).toBe("환경");
    expect(invalid.validationMessage).toBeTruthy();
  });

  it("검색어를 모두 지우면 제출하지 않아도 검색 조건을 제거한다", () => {
    const state = reduce([
      { type: "draft-changed", value: "정책" },
      { type: "submitted" },
      { type: "draft-changed", value: "   " },
    ]);

    expect(state.appliedQuery).toBeUndefined();
  });
});

function reduce(
  actions: readonly PublicRoomSearchAction[],
  initialState: PublicRoomSearchState = INITIAL_PUBLIC_ROOM_SEARCH_STATE,
): PublicRoomSearchState {
  return actions.reduce(reducePublicRoomSearchState, initialState);
}
