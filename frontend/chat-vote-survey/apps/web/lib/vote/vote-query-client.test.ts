import { describe, expect, it } from "vitest";
import { VoteApiError } from "./vote-fetch";
import { shouldRetryVoteQuery } from "./vote-query-client";

describe("Vote query retry policy", () => {
  it("인증과 권한 오류는 자동 재시도하지 않는다", () => {
    expect(shouldRetryVoteQuery(0, new VoteApiError(401, "", "/vote", undefined))).toBe(false);
    expect(shouldRetryVoteQuery(0, new VoteApiError(403, "", "/vote", undefined))).toBe(false);
  });

  it("그 밖의 조회 오류는 한 번만 재시도한다", () => {
    expect(shouldRetryVoteQuery(0, new Error("network"))).toBe(true);
    expect(shouldRetryVoteQuery(1, new Error("network"))).toBe(false);
  });
});
