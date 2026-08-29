import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ParticipantHome, ParticipantHomeBrand } from "./participant-home";

describe("ParticipantHome", () => {
  it("홈 안내와 플랫폼 도메인 진입 action을 렌더링한다", () => {
    const markup = renderToStaticMarkup(<ParticipantHome />);

    expect(markup).toContain('data-participant-home="true"');
    expect(markup).toContain("의견을 가다듬고, 나누고, 담아내는 곳");
    expect(markup).toContain('href="/rag"');
    expect(markup).toContain('href="/chat"');
    expect(markup).toContain('href="/vote"');
    expect(markup).toContain("어떤 점부터 짚어볼까요?");
    expect(markup).toContain("서로 오가는 이야기");
    expect(markup).toContain("논의에 보태는 내 의견");
    expect(markup).toContain("질문하기");
    expect(markup).toContain("토론하기");
    expect(markup).toContain("투표하기");
  });

  it("홈 header용 CIVIC.AI 브랜드를 렌더링한다", () => {
    expect(renderToStaticMarkup(<ParticipantHomeBrand />)).toContain("CIVIC.AI");
  });
});
