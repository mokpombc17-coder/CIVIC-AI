import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  shouldShowSurveyHeaderProgress,
  SurveyHeaderProgress,
  SurveyProgress,
  SurveyStepActions,
} from "./survey-flow";

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

  it("헤더에는 현재 단계 숫자만 간결하게 표시한다", () => {
    const html = renderToStaticMarkup(<SurveyHeaderProgress currentStep={4} totalSteps={8} />);

    expect(html).toContain('aria-label="설문 진행 단계 4/8"');
    expect(html).toContain("4/8");
    expect(html).not.toContain("survey-header-progress");
  });

  it("본문 진행 표시가 경계를 충분히 벗어났을 때 헤더 단계를 표시한다", () => {
    expect(shouldShowSurveyHeaderProgress({ progressBottom: 80, viewportTop: 100 })).toBe(true);
    expect(shouldShowSurveyHeaderProgress({ progressBottom: 140, viewportTop: 100 })).toBe(false);
    expect(shouldShowSurveyHeaderProgress({ progressBottom: 96, viewportTop: 100 })).toBe(false);
  });

  it("표시 경계에 여유를 두어 스크롤 진동으로 인한 깜빡임을 막는다", () => {
    expect(
      shouldShowSurveyHeaderProgress({
        currentlyVisible: true,
        progressBottom: 104,
        viewportTop: 100,
      }),
    ).toBe(true);
    expect(
      shouldShowSurveyHeaderProgress({
        currentlyVisible: true,
        progressBottom: 108,
        viewportTop: 100,
      }),
    ).toBe(false);
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
