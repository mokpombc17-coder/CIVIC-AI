import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { VoteTaskResultScreen } from "./vote-task-result-screen";

vi.mock("next/navigation", () => ({
  usePathname: () => "/vote/task-01/result",
}));

describe("VoteTaskResultScreen", () => {
  it("결과 화면에서 투표 대상을 주제로 안내한다", () => {
    const html = renderToStaticMarkup(<VoteTaskResultScreen source="mock" taskId="task-01" />);

    expect(html).toContain(">주제</h2>");
    expect(html).toContain(">질문</dt>");
    expect(html).not.toContain(">과업</h2>");
    expect(html).not.toContain(">질의</dt>");
  });
});
