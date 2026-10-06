import { describe, expect, it } from "vitest";
import {
  getVoteTaskListHref,
  getVoteTaskSearchHref,
  parseVoteTaskListTab,
  parseVoteTaskListView,
  parseVoteTaskSearchQuery,
} from "./vote-task-list-navigation";

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
    expect(getVoteTaskListHref("active", "주민센터")).toBe(
      "/vote?query=%EC%A3%BC%EB%AF%BC%EC%84%BC%ED%84%B0&view=list",
    );
    expect(getVoteTaskListHref("completed", "주민센터")).toBe(
      "/vote?tab=completed&query=%EC%A3%BC%EB%AF%BC%EC%84%BC%ED%84%B0&view=list",
    );
  });

  it("검색어를 정규화하고 검색 전 탭과 함께 URL에 기록한다", () => {
    expect(parseVoteTaskSearchQuery("  주민센터  ")).toBe("주민센터");
    expect(parseVoteTaskSearchQuery(["교통", "주차"])).toBe("교통");
    expect(parseVoteTaskSearchQuery("가".repeat(201))).toBe("");
    expect(getVoteTaskSearchHref("active", "주민센터")).toBe(
      "/vote?query=%EC%A3%BC%EB%AF%BC%EC%84%BC%ED%84%B0",
    );
    expect(getVoteTaskSearchHref("completed", "대중 교통")).toBe(
      "/vote?tab=completed&query=%EB%8C%80%EC%A4%91+%EA%B5%90%ED%86%B5",
    );
  });

  it("검색어가 있으면 검색 결과를 기본 view로 사용하고 목록 view를 명시적으로 복원한다", () => {
    expect(parseVoteTaskListView(undefined, "주민센터")).toBe("search");
    expect(parseVoteTaskListView("search", "주민센터")).toBe("search");
    expect(parseVoteTaskListView("list", "주민센터")).toBe("list");
    expect(parseVoteTaskListView("unknown", "주민센터")).toBe("search");
    expect(parseVoteTaskListView("search", "")).toBe("list");
  });
});
