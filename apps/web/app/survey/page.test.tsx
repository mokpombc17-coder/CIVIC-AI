import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SurveyPage, { metadata } from "./page";

describe("SurveyPage", () => {
  it("PlatformShell 기반 설문 흐름을 독립 route로 제공한다", async () => {
    const page = await SurveyPage({
      searchParams: Promise.resolve({ from: "/vote?tab=active" }),
    });
    const html = renderToStaticMarkup(page);

    expect(metadata.title).toBe("설문조사");
    expect(html).toContain('data-survey-screen="flow"');
    expect(html).toContain("설문 정보 입력");
    expect(html).toContain("1/8");
    expect(html).toContain('href="/vote?tab=active"');
    expect(html).not.toContain('aria-label="참여자 주요 메뉴"');
    expect(html).not.toContain('data-state="disabled"');
  });
});
