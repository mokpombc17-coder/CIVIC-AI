import { describe, expect, it } from "vitest";
import { calculateVotePercentage } from "./vote-completed-contracts";

describe("calculateVotePercentage", () => {
  it("응답이 0이면 NaN이나 Infinity 대신 0을 반환한다", () => {
    expect(calculateVotePercentage(0, 0)).toBe(0);
  });

  it("Backend count를 백분율로 변환한다", () => {
    expect(calculateVotePercentage(72, 120)).toBe(60);
  });
});
