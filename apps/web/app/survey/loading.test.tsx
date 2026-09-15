import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SurveyLoading from "./loading";

describe("SurveyLoading", () => {
  it("설문 화면과 동일한 shell 안에 전용 로딩 안내를 표시한다", () => {
    const html = renderToStaticMarkup(<SurveyLoading />);

    expect(html).toContain('data-platform-shell-content="true" data-scroll="child"');
    expect(html).toContain('data-survey-screen="flow"');
    expect(html).toContain('data-survey-loading="true"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("설문 정보 입력");
    expect(html).toContain("설문을 불러오는 중입니다.");
    expect(html).toContain("참여할 설문 내용을 확인하고 있어요.");
    expect(html).not.toContain("화면을 준비하고 있습니다");
  });
});
