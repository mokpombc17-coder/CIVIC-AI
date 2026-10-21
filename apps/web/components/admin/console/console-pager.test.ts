import { describe, expect, it } from "vitest";
import { consolePagerRangeLabel, consoleTotalPages, isConsolePageSize } from "./console-pager";

describe("admin console pager", () => {
  it("전체 수를 아는 목록은 현재 범위와 전체 건수를 보여준다", () => {
    expect(
      consolePagerRangeLabel({ page: 1, pageSize: 20, shown: 20, total: 145, unit: "명" }),
    ).toBe("1-20 / 전체 145명");
    expect(
      consolePagerRangeLabel({ page: 8, pageSize: 20, shown: 5, total: 145, unit: "명" }),
    ).toBe("141-145 / 전체 145명");
    expect(consolePagerRangeLabel({ page: 1, pageSize: 20, shown: 0, total: 0 })).toBe(
      "표시할 항목 없음",
    );
    expect(consoleTotalPages(145, 20)).toBe(8);
    expect(consoleTotalPages(0, 20)).toBe(1);
  });

  it("전체 수가 없는 커서 목록은 범위와 다음 페이지 여부만 보여준다", () => {
    expect(consolePagerRangeLabel({ page: 2, pageSize: 20, shown: 20, total: null })).toBe(
      "21-40건",
    );
    expect(consolePagerRangeLabel({ page: 3, pageSize: 20, shown: 7, total: null })).toBe(
      "41-47건",
    );
  });

  it("페이지 크기는 20·50·100만 허용한다", () => {
    expect([20, 50, 100].every(isConsolePageSize)).toBe(true);
    expect(isConsolePageSize(25)).toBe(false);
  });
});
