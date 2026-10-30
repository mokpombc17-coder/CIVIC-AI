import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import VoteLayout from "./layout";

vi.mock("next/navigation", () => ({
  usePathname: () => "/vote/task-1",
}));

describe("VoteLayout", () => {
  it("eligibility 확인 전에는 투표 목록 fallback을 유지하고 하위 화면을 숨긴다", () => {
    const markup = renderToStaticMarkup(<VoteLayout>protected vote content</VoteLayout>);

    expect(markup).toContain('data-vote-task-list-loading="true"');
    expect(markup).toContain('data-header-size="compact"');
    expect(markup).not.toContain("protected vote content");
  });
});
