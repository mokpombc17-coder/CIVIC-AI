import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import VotePage from "./page";

vi.mock("@/components/vote/vote-task-list-screen", () => ({
  VoteTaskListScreen: ({
    initialQuery,
    initialTab,
    initialView,
  }: {
    initialQuery: string;
    initialTab: string;
    initialView: string;
  }) => (
    <div
      data-initial-query={initialQuery}
      data-initial-tab={initialTab}
      data-initial-view={initialView}
    />
  ),
}));

describe("VotePage", () => {
  it("완료 탭 query를 목록 screen의 초기값으로 전달한다", async () => {
    const page = await VotePage({ searchParams: Promise.resolve({ tab: "completed" }) });

    expect(renderToStaticMarkup(page)).toContain('data-initial-tab="completed"');
  });

  it("유효하지 않은 탭 query는 진행 중으로 정규화한다", async () => {
    const page = await VotePage({ searchParams: Promise.resolve({ tab: "unknown" }) });

    expect(renderToStaticMarkup(page)).toContain('data-initial-tab="active"');
  });

  it("검색어를 정규화해 목록 screen의 초기값으로 전달한다", async () => {
    const page = await VotePage({
      searchParams: Promise.resolve({ query: "  주민센터  ", tab: "completed" }),
    });
    const html = renderToStaticMarkup(page);

    expect(html).toContain('data-initial-query="주민센터"');
    expect(html).toContain('data-initial-tab="completed"');
    expect(html).toContain('data-initial-view="search"');
  });

  it("검색어를 유지한 목록 view를 복원한다", async () => {
    const page = await VotePage({
      searchParams: Promise.resolve({ query: "주민센터", tab: "active", view: "list" }),
    });

    expect(renderToStaticMarkup(page)).toContain('data-initial-view="list"');
  });

  it("검색어가 없어도 명시적인 검색 결과 view를 복원한다", async () => {
    const page = await VotePage({
      searchParams: Promise.resolve({ view: "search" }),
    });

    expect(renderToStaticMarkup(page)).toContain('data-initial-view="search"');
  });
});
