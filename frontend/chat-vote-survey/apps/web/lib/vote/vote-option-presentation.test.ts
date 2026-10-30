import { describe, expect, it } from "vitest";
import {
  hasLongVoteOptionContent,
  isLongVoteOptionContent,
  LONG_VOTE_OPTION_CONTENT_THRESHOLD,
} from "./vote-option-presentation";

describe("vote option presentation", () => {
  it("앞뒤 공백을 제외하고 10자를 초과한 선택지를 긴 문구로 구분한다", () => {
    expect(LONG_VOTE_OPTION_CONTENT_THRESHOLD).toBe(10);
    expect(isLongVoteOptionContent("가".repeat(10))).toBe(false);
    expect(isLongVoteOptionContent(`  ${"가".repeat(10)}  `)).toBe(false);
    expect(isLongVoteOptionContent("가".repeat(11))).toBe(true);
  });

  it("긴 선택지가 하나라도 있으면 목록 배치를 사용하도록 구분한다", () => {
    expect(
      hasLongVoteOptionContent([
        { content: "대중교통 증편" },
        { content: "광주 AI·미래차, 나주 에너지" },
      ]),
    ).toBe(true);
    expect(
      hasLongVoteOptionContent([{ content: "대중교통 증편" }, { content: "통행료 도입" }]),
    ).toBe(false);
  });
});
