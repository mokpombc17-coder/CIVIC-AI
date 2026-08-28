import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SafeMarkdownAnswer, stripCitationMarkers } from "@/components/rag/safe-markdown-answer";

describe("stripCitationMarkers", () => {
  it("본문에 섞인 [UUID] 인용 마커를 제거한다", () => {
    expect(
      stripCitationMarkers(
        "비상 집결 장소는 7번 게이트입니다 [0d7d9db6-6352-48f3-b2e1-222cd34069c9]. 확인하세요.",
      ),
    ).toBe("비상 집결 장소는 7번 게이트입니다. 확인하세요.");
  });

  it("UUID 형식이 아닌 대괄호 텍스트는 유지한다", () => {
    expect(stripCitationMarkers("조항 [부칙 3조] 참고")).toBe("조항 [부칙 3조] 참고");
  });

  it("마커 여러 개와 이중 공백을 정리한다", () => {
    const answer =
      "첫 근거 [11111111-2222-4333-8444-555555555555] 그리고  둘째 [aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee]";
    expect(stripCitationMarkers(answer)).toBe("첫 근거 그리고 둘째");
  });
});

describe("SafeMarkdownAnswer", () => {
  it("렌더링 결과에 인용 마커가 노출되지 않는다", () => {
    const html = renderToStaticMarkup(
      <SafeMarkdownAnswer answer="집결 장소는 7번 게이트입니다 [0d7d9db6-6352-48f3-b2e1-222cd34069c9]." />,
    );
    expect(html).toContain("집결 장소는 7번 게이트입니다.");
    expect(html).not.toContain("0d7d9db6");
  });
});
