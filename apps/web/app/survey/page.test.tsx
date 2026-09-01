import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SurveyPage, { metadata } from "./page";

describe("SurveyPage", () => {
  it("설문 준비 화면을 독립 route로 제공한다", () => {
    const html = renderToStaticMarkup(<SurveyPage />);

    expect(metadata.title).toBe("설문조사");
    expect(html).toContain('data-survey-screen="preparation"');
    expect(html).toContain("설문조사 화면을 준비하고 있습니다.");
    expect(html).not.toContain('aria-label="참여자 주요 메뉴"');
  });
});
