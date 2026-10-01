import { describe, expect, it } from "vitest";
import { elapsedLabel, parseTimestamp } from "./elapsed";

describe("elapsedLabel", () => {
  const start = Date.parse("2026-10-01T00:00:00Z");

  it.each([
    [30_000, "1분 미만"],
    [47 * 60_000, "47분"],
    [2 * 3_600_000, "2시간"],
    [2 * 3_600_000 + 5 * 60_000, "2시간 5분"],
    [26 * 3_600_000, "1일 2시간"],
    [48 * 3_600_000, "2일"],
  ])("%dms 경과는 %s로 표시한다", (elapsed, label) => {
    expect(elapsedLabel(start, start + elapsed)).toBe(label);
  });

  it("시계가 뒤로 가도 음수 경과를 표시하지 않는다", () => {
    expect(elapsedLabel(start, start - 60_000)).toBe("1분 미만");
  });

  it("잘못된 시각은 null로 해석한다", () => {
    expect(parseTimestamp("not-a-date")).toBeNull();
    expect(parseTimestamp(null)).toBeNull();
    expect(parseTimestamp("2026-10-01T00:00:00Z")).toBe(start);
  });
});
