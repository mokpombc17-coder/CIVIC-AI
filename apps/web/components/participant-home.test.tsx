import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ParticipantHome, ParticipantHomeBrand } from "./participant-home";

describe("ParticipantHome", () => {
  it("홈 안내와 플랫폼 도메인 진입 action을 렌더링한다", () => {
    const markup = renderToStaticMarkup(<ParticipantHome />);

    expect(markup).toContain('data-participant-home="true"');
    expect(markup).toContain("배우고, 함께 토론하고, 결정합니다.");
    expect(markup).toContain('href="/rag"');
    expect(markup).toContain('href="/chat"');
    expect(markup).toContain('href="/vote"');
    expect(markup).toContain("무엇이 궁금한가요?");
    expect(markup).toContain("함께 나누는 의견");
    expect(markup).toContain("내 생각을 더하는 한 표");
    expect(markup).toContain("질문하기");
    expect(markup).toContain("토론하기");
    expect(markup).toContain("참여하기");
  });

  it("홈 header용 CIVIC.AI 브랜드를 렌더링한다", () => {
    expect(renderToStaticMarkup(<ParticipantHomeBrand />)).toContain("CIVIC.AI");
  });
});
