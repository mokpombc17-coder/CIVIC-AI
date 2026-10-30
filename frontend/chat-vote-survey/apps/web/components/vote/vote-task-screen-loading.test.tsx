import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { VoteTaskScreenLoading } from "./vote-task-screen-loading";

vi.mock("next/navigation", () => ({
  usePathname: () => "/vote/task-01",
}));

describe("VoteTaskScreenLoading", () => {
  it("투표 상세 구조와 4개의 응답 선택지 skeleton을 표시한다", () => {
    const markup = renderToStaticMarkup(<VoteTaskScreenLoading />);

    expect(markup).toContain('data-platform-shell="true"');
    expect(markup).toContain('href="/vote"');
    expect(markup).toContain("투표 참여하기");
    expect(markup).toContain('data-vote-task-screen-loading="true"');
    expect(markup).toContain("1/4");
    expect(markup).toContain("투표 확인");
    expect(markup).toContain('data-info-row="question"');
    expect(markup.match(/data-vote-task-question-skeleton-line="true"/g)).toHaveLength(2);
    expect(markup.match(/data-vote-task-option-skeleton="true"/g)).toHaveLength(4);
    expect(markup).toContain('data-vote-task-action-skeleton="true"');
  });
});
