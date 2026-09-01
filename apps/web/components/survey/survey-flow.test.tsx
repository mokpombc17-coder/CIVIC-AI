import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SurveyProgress, SurveyStepActions } from "./survey-flow";

describe("SurveyProgress", () => {
  it("현재 단계를 포함한 8개 진행 구간을 표시한다", () => {
    const html = renderToStaticMarkup(
      <SurveyProgress currentStep={3} stepTitle="생활 · 경제" totalSteps={8} />,
    );

    expect(html).toContain("3/8");
    expect(html).toContain("생활 · 경제");
    expect(html.match(/aria-label="\d단계"/g)).toHaveLength(8);
    expect(html.match(/data-state="complete"/g)).toHaveLength(2);
    expect(html.match(/data-state="current"/g)).toHaveLength(1);
    expect(html.match(/data-state="upcoming"/g)).toHaveLength(5);
  });
});

describe("SurveyStepActions", () => {
  it("첫 단계에는 안전한 복귀 경로와 다음 action을 제공한다", () => {
    const html = renderActions({ currentStep: 1 });

    expect(html).toContain('href="/vote?tab=active"');
    expect(html).toContain(">취소하기</a>");
    expect(html).toContain(">다음으로</button>");
  });

  it("중간 단계에는 이전과 다음 action을 제공한다", () => {
    const html = renderActions({ currentStep: 4 });

    expect(html).toContain(">이전으로</button>");
    expect(html).toContain(">다음으로</button>");
  });

  it("마지막 단계의 제출 action은 연결 전까지 비활성화한다", () => {
    const html = renderActions({ currentStep: 8 });

    expect(html).toContain(">이전으로</button>");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>제출하기<\/button>/);
  });
});

function renderActions({ currentStep }: { currentStep: number }): string {
  return renderToStaticMarkup(
    <SurveyStepActions
      cancelHref="/vote?tab=active"
      currentStep={currentStep}
      onNext={vi.fn()}
      onPrevious={vi.fn()}
      totalSteps={8}
    />,
  );
}
