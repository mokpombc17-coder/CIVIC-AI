import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/vote" }));

vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));
vi.mock("@/components/vote/vote-task-list-screen", () => ({
  VoteTaskListScreen: () => <div data-loading-kind="list" />,
}));
vi.mock("@/components/vote/vote-task-screen-loading", () => ({
  VoteTaskScreenLoading: () => <div data-loading-kind="task" />,
}));

import VoteLoading, { resolveVoteLoadingKind } from "./loading";

describe("VoteLoading", () => {
  beforeEach(() => {
    navigation.pathname = "/vote";
  });

  it("목록 경로와 상세 경로의 로딩 화면을 구분한다", () => {
    expect(resolveVoteLoadingKind("/vote")).toBe("list");
    expect(resolveVoteLoadingKind("/vote/task-01")).toBe("task");
    expect(resolveVoteLoadingKind("/vote/task-01/result")).toBe("task");
  });

  it("목록 복귀에는 cache-aware 목록 화면을 사용한다", () => {
    expect(renderToStaticMarkup(<VoteLoading />)).toContain('data-loading-kind="list"');
  });

  it("상세 진입에는 목록 skeleton 대신 상세 로딩 화면을 사용한다", () => {
    navigation.pathname = "/vote/task-01";

    expect(renderToStaticMarkup(<VoteLoading />)).toContain('data-loading-kind="task"');
  });
});
