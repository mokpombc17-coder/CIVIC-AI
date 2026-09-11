import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { votePublishingResult } from "@/lib/vote/vote-publishing-fixtures";
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

  it("정량 결과 아래에 정성 요약 영역을 안내한다", () => {
    const html = renderToStaticMarkup(<VoteTaskResultScreen source="mock" taskId="task-01" />);

    expect(html).not.toContain("디자인 샘플");
    expect(html).toContain(">내 제출</span>");
    expect(html).not.toMatch(/class="[^"]*resultSummaryBadge[^"]*">AI<\/span>/);
    expect(html).not.toContain(">내 제출</h2>");
    expect(html).toContain(">같은 선택을 한 사람들은 어떤 이유를 들었을까요?</h3>");
    expect(html).toContain(">다른 선택을 한 사람들은 어떤 이유를 들었을까요?</h3>");
    expect(html).toContain(votePublishingResult.qualitativeSummary.sameChoice);
    expect(html).toContain(votePublishingResult.qualitativeSummary.differentChoices);
    expect(html).not.toContain("resultQualitativePlaceholder");
  });

  it("mock 비교용으로 AI 요약 뱃지를 표시할 수 있다", () => {
    const html = renderToStaticMarkup(
      <VoteTaskResultScreen showAiBadges source="mock" taskId="task-01" />,
    );

    expect(html.match(/class="[^"]*resultSummaryBadge[^"]*">AI<\/span>/g)).toHaveLength(2);
    expect(html).toContain(">같은 선택을 한 사람들은 어떤 이유를 들었을까요?</h3>");
    expect(html).toContain(">다른 선택을 한 사람들은 어떤 이유를 들었을까요?</h3>");
  });

  it("엑셀을 기준으로 만든 울산 트램 결과 mock을 표시한다", () => {
    const html = renderToStaticMarkup(<VoteTaskResultScreen source="mock" taskId="task-01" />);

    expect(html).toContain("울산 도시철도1호선(트램)");
    expect(html).toContain("울산도시철도 1호선 사업을 원안대로 진행해야 한다에 동의하십니까?");
    expect(html).toContain(">100명</strong>");
    expect(html).toContain(">동의한다</span>");
    expect(html).toContain("7명 · 7.0%");
    expect(html).toContain(">동의하지 않는다</span>");
    expect(html).toContain("60명 · 60.0%");
    expect(html).toContain(">잘모르겠다</span>");
    expect(html).toContain("33명 · 33.0%");
    expect(votePublishingResult.mySubmission).toMatchObject({
      respondentNumber: 1,
      selectedOptionId: "result-option-2",
    });
    expect(html).toContain(">동의하지 않는다</h3>");
    expect(html).not.toContain(">선택</dt>");
    expect(html).not.toContain(">이유</dt>");
    expect(html).toContain(votePublishingResult.mySubmission.finalReason);
  });
});
