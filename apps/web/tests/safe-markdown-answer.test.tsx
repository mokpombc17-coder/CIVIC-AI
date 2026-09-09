import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  RagCitationSources,
  SafeMarkdownAnswer,
  citationChipLabel,
  citationDisplayTitle,
  citationForMarker,
  normalizeCitationPunctuation,
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
  it("문장 끝 단일·복수 출처 뒤의 마침표를 출처 묶음 앞으로 옮긴다", () => {
    expect(
      normalizeCitationPunctuation("단일 출처입니다 [0d7d9db6-6352-48f3-b2e1-222cd34069c9#3]."),
    ).toBe("단일 출처입니다. [0d7d9db6-6352-48f3-b2e1-222cd34069c9#3]");
    expect(
      normalizeCitationPunctuation(
        "복수 출처입니다 [0d7d9db6-6352-48f3-b2e1-222cd34069c9#3], " +
          "[0d7d9db6-6352-48f3-b2e1-222cd34069c9#8].",
      ),
    ).toBe(
      "복수 출처입니다. [0d7d9db6-6352-48f3-b2e1-222cd34069c9#3], " +
        "[0d7d9db6-6352-48f3-b2e1-222cd34069c9#8]",
    );
    expect(
      normalizeCitationPunctuation(
        "묶음 출처입니다 [0d7d9db6-6352-48f3-b2e1-222cd34069c9#3, " +
          "0d7d9db6-6352-48f3-b2e1-222cd34069c9#8].",
      ),
    ).toBe(
      "묶음 출처입니다. [0d7d9db6-6352-48f3-b2e1-222cd34069c9#3, " +
        "0d7d9db6-6352-48f3-b2e1-222cd34069c9#8]",
    );
  });

  it("출처와 무관한 마침표는 변경하지 않는다", () => {
    expect(normalizeCitationPunctuation("일반 문장입니다. 다음 문장입니다.")).toBe(
      "일반 문장입니다. 다음 문장입니다.",
    );
  });

  it("인용 목록과 일치하는 [UUID#page] 마커를 출처 번호로 치환한다", () => {
    const html = renderToStaticMarkup(
      <SafeMarkdownAnswer
        answer="집결 장소는 7번 게이트입니다 [0d7d9db6-6352-48f3-b2e1-222cd34069c9#3]."
        citations={[citation]}
      />,
    );
    expect(html).not.toContain("0d7d9db6");
    expect(html).toContain('class="civic-citation-reference"');
    expect(html).toContain(">[1]</button>");
    expect(html).toContain("집결 장소는 7번 게이트입니다");
    expect(html).toContain("게이트입니다.");
    expect(html.indexOf("게이트입니다.")).toBeLessThan(
      html.indexOf('class="civic-citation-reference"'),
    );
    expect(html).not.toContain("</button>.</p>");
  });

  it("일치하는 인용이 없는 마커는 본문에 노출하지 않는다", () => {
    const html = renderToStaticMarkup(
      <SafeMarkdownAnswer
        answer="근거는 다음과 같습니다 [11111111-2222-4333-8444-555555555555#2]."
        citations={[citation]}
      />,
    );
    expect(html).not.toContain("11111111");
    expect(html).not.toContain("civic-citation-reference");
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
    expect(html.match(/class="civic-citation-reference"/gu)).toHaveLength(1);
    expect(html).toContain(">[1]</button>");
  });

  it("같은 문장의 복수 출처 번호는 구분자 없이 이어서 표시한다", () => {
    const pageEight = { ...citation, page_number: 8 };
    const html = renderToStaticMarkup(
      <SafeMarkdownAnswer
        answer={
          "복수 근거입니다 [0d7d9db6-6352-48f3-b2e1-222cd34069c9#3], " +
          "[0d7d9db6-6352-48f3-b2e1-222cd34069c9#8]."
        }
        citations={[citation, pageEight]}
      />,
    );

    expect(html).toContain(">[1]</button><button");
    expect(html).toContain(">[2]</button>");
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
    expect(html).toContain(">[1]</button>");

    const ambiguous = renderToStaticMarkup(
      <SafeMarkdownAnswer
        answer="페이지를 알 수 없습니다 [0d7d9db6-6352-48f3-b2e1-222cd34069c9]."
        citations={[citation, { ...citation, page_number: 8 }]}
      />,
    );
    expect(ambiguous).not.toContain("0d7d9db6");
    expect(ambiguous).not.toContain("civic-citation-reference");
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

  it("출처 목록용 제목에서는 파일 확장자만 숨긴다", () => {
    expect(citationDisplayTitle({ ...citation, title: "2026 복지정책 기본계획.txt" })).toBe(
      "2026 복지정책 기본계획",
    );
    expect(citationDisplayTitle({ ...citation, title: "정책.v2.PDF" })).toBe("정책.v2");
    expect(citationDisplayTitle({ ...citation, title: "현장 사진.JPEG" })).toBe("현장 사진");
  });

  it("본문 등장 순서로 번호를 재사용하고 답변 아래 출처 목록을 표시한다", () => {
    const pageEight = { ...citation, page_number: 8, title: "2026 복지정책 기본계획.txt" };
    const answer =
      "첫 근거 [0d7d9db6-6352-48f3-b2e1-222cd34069c9#8], " +
      "둘째 근거 [0d7d9db6-6352-48f3-b2e1-222cd34069c9#3], " +
      "첫 근거 재인용 [0d7d9db6-6352-48f3-b2e1-222cd34069c9#8].";
    const inlineHtml = renderToStaticMarkup(
      <SafeMarkdownAnswer answer={answer} citations={[citation, pageEight]} />,
    );
    const sourcesHtml = renderToStaticMarkup(
      <RagCitationSources answer={answer} citations={[citation, pageEight]} />,
    );

    expect(inlineHtml.match(/class="civic-citation-reference"/gu)).toHaveLength(3);
    expect(inlineHtml.match(/>\[1\]<\/button>/gu)).toHaveLength(2);
    expect(inlineHtml.match(/>\[2\]<\/button>/gu)).toHaveLength(1);
    expect(sourcesHtml).toContain('aria-label="답변 출처"');
    expect(sourcesHtml.match(/class="civic-rag-source-item"/gu)).toHaveLength(2);
    expect(sourcesHtml).toContain("2026 복지정책 기본계획");
    expect(sourcesHtml).not.toContain("기본계획.txt</span>");
    expect(sourcesHtml.indexOf("p.8")).toBeLessThan(sourcesHtml.indexOf("p.3"));
    expect(sourcesHtml).not.toContain("<details");
  });

  it("출처가 2개를 넘으면 나머지를 더보기 영역에 넣는다", () => {
    const pages = [1, 2, 3, 4];
    const citations = pages.map((pageNumber) => ({
      ...citation,
      page_number: pageNumber,
      title: `정책 근거 ${pageNumber}.pdf`,
    }));
    const answer = pages
      .map(
        (pageNumber) => `근거 ${pageNumber} [0d7d9db6-6352-48f3-b2e1-222cd34069c9#${pageNumber}]`,
      )
      .join(" ");
    const html = renderToStaticMarkup(<RagCitationSources answer={answer} citations={citations} />);

    expect(html.match(/class="civic-rag-source-item"/gu)).toHaveLength(4);
    expect(html).toContain('<details class="civic-rag-source-more">');
    expect(html).not.toContain('<details class="civic-rag-source-more" open="">');
    expect(html).toContain("출처 2개 더보기");
    expect(html).toContain("출처 접기");
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

  it("Markdown 수평 구분선은 표시하지 않고 앞뒤 본문은 유지한다", () => {
    const html = renderToStaticMarkup(
      <SafeMarkdownAnswer answer={"첫 문단\n\n---\n\n둘째 문단"} />,
    );

    expect(html).toContain("첫 문단");
    expect(html).toContain("둘째 문단");
    expect(html).not.toContain("<hr");
  });
});
