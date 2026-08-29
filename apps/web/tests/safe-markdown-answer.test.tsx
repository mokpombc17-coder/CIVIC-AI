import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  SafeMarkdownAnswer,
  citationChipLabel,
  citationForMarker,
  stripCitationMarkers,
} from "@/components/rag/safe-markdown-answer";

const citation = {
  document_version_id: "0d7d9db6-6352-48f3-b2e1-222cd34069c9",
  page_number: 3,
  page_count: 12,
  source_object_sha256: "a".repeat(64),
  title: "2026 복지정책 기본계획",
};

describe("본문 인용 마커", () => {
  it("인용 목록과 일치하는 [UUID#page] 마커를 문서 칩으로 치환한다", () => {
    const html = renderToStaticMarkup(
      <SafeMarkdownAnswer
        answer="집결 장소는 7번 게이트입니다 [0d7d9db6-6352-48f3-b2e1-222cd34069c9#3]."
        citations={[citation]}
      />,
    );
    expect(html).not.toContain("0d7d9db6");
    expect(html).toContain('class="civic-citation-chip"');
    expect(html).toContain("2026 복지정책 기본계획");
    expect(html).toContain("p.3");
    expect(html).toContain("집결 장소는 7번 게이트입니다");
  });

  it("일치하는 인용이 없는 마커는 본문에 노출하지 않는다", () => {
    const html = renderToStaticMarkup(
      <SafeMarkdownAnswer
        answer="근거는 다음과 같습니다 [11111111-2222-4333-8444-555555555555#2]."
        citations={[citation]}
      />,
    );
    expect(html).not.toContain("11111111");
    expect(html).not.toContain("civic-citation-chip");
  });

  it("한 괄호에 합쳐진 복수 인용은 발급된 인용만 칩으로 표시한다", () => {
    const html = renderToStaticMarkup(
      <SafeMarkdownAnswer
        answer={
          "세부 차원입니다 [11111111-2222-4333-8444-555555555555#2, " +
          "0d7d9db6-6352-48f3-b2e1-222cd34069c9#3]."
        }
        citations={[citation]}
      />,
    );
    expect(html).not.toContain("11111111");
    expect(html).not.toContain("0d7d9db6");
    expect(html.match(/class="civic-citation-chip"/gu)).toHaveLength(1);
    expect(html).toContain("p.3");
  });

  it("한글 조사가 뒤따르는 굵은 글씨의 별표를 노출하지 않는다", () => {
    const html = renderToStaticMarkup(
      <SafeMarkdownAnswer answer="**지배감(Dominance)**의 세 가지 차원" />,
    );
    expect(html).toContain("<strong>지배감(Dominance)의</strong>");
    expect(html).not.toContain("**");
  });

  it("이전 답변의 [UUID] 마커는 같은 문서 인용이 하나일 때만 호환 칩으로 표시한다", () => {
    const html = renderToStaticMarkup(
      <SafeMarkdownAnswer
        answer="이전 형식의 답변입니다 [0d7d9db6-6352-48f3-b2e1-222cd34069c9]."
        citations={[citation]}
      />,
    );
    expect(html).not.toContain("0d7d9db6");
    expect(html).toContain("p.3");

    const ambiguous = renderToStaticMarkup(
      <SafeMarkdownAnswer
        answer="페이지를 알 수 없습니다 [0d7d9db6-6352-48f3-b2e1-222cd34069c9]."
        citations={[citation, { ...citation, page_number: 8 }]}
      />,
    );
    expect(ambiguous).not.toContain("0d7d9db6");
    expect(ambiguous).not.toContain("civic-citation-chip");
  });

  it("UUID 형식이 아닌 대괄호 텍스트는 유지한다", () => {
    const html = renderToStaticMarkup(
      <SafeMarkdownAnswer answer="조항 [부칙 3조] 참고" citations={[citation]} />,
    );
    expect(html).toContain("[부칙 3조]");
  });

  it("citationForMarker는 문서와 페이지가 모두 같은 인용을 찾는다", () => {
    const otherPage = { ...citation, page_number: 8 };
    expect(
      citationForMarker([citation, otherPage], "[0D7D9DB6-6352-48F3-B2E1-222CD34069C9#8]"),
    ).toBe(otherPage);
    expect(
      citationForMarker([citation, otherPage], "[0D7D9DB6-6352-48F3-B2E1-222CD34069C9#4]"),
    ).toBeNull();
  });

  it("칩 라벨은 문서명과 페이지를 함께 쓴다", () => {
    expect(citationChipLabel(citation)).toBe("2026 복지정책 기본계획 p.3");
  });

  it("stripCitationMarkers는 잔여 마커와 이중 공백을 정리한다", () => {
    expect(
      stripCitationMarkers("첫 근거 [11111111-2222-4333-8444-555555555555#2] 그리고  둘째"),
    ).toBe("첫 근거 그리고 둘째");
    expect(
      stripCitationMarkers(
        "첫 근거 [11111111-2222-4333-8444-555555555555#2, " +
          "22222222-2222-4222-8222-222222222222#3] 그리고  둘째",
      ),
    ).toBe("첫 근거 그리고 둘째");
  });

  it("GFM 표, 링크, 인용문, 코드 블록을 안전하게 렌더링한다", () => {
    const html = renderToStaticMarkup(
      <SafeMarkdownAnswer
        answer={
          "| 구분 | 내용 |\n| --- | --- |\n| 대상 | 재학생 |\n\n> 확인 사항\n\n[공고](https://example.com/notice)\n\n```text\n신청서\n```"
        }
      />,
    );

    expect(html).toContain("<table");
    expect(html).toContain("<blockquote>");
    expect(html).toContain('href="https://example.com/notice"');
    expect(html).toContain('<pre><code class="language-text">신청서');
  });
});
