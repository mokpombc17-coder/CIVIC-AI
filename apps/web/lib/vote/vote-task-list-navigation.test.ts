import { describe, expect, it } from "vitest";
import { getVoteTaskListHref, parseVoteTaskListTab } from "./vote-task-list-navigation";

describe("vote task list navigation", () => {
  it("completed query만 완료 탭으로 복원한다", () => {
    expect(parseVoteTaskListTab("completed")).toBe("completed");
    expect(parseVoteTaskListTab(["completed", "active"])).toBe("completed");
    expect(parseVoteTaskListTab("unknown")).toBe("active");
    expect(parseVoteTaskListTab(undefined)).toBe("active");
  });

  it("기본 탭은 query를 제거하고 완료 탭은 URL에 기록한다", () => {
    expect(getVoteTaskListHref("active")).toBe("/vote");
    expect(getVoteTaskListHref("completed")).toBe("/vote?tab=completed");
  });
});
