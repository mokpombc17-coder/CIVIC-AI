import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import VotePage from "./page";

vi.mock("@/components/vote/vote-task-list-screen", () => ({
  VoteTaskListScreen: ({ initialTab }: { initialTab: string }) => (
    <div data-initial-tab={initialTab} />
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
});
