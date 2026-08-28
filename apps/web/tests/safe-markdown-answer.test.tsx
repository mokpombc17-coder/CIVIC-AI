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
  it("인용 목록과 일치하는 [UUID] 마커를 문서 칩으로 치환한다", () => {
    const html = renderToStaticMarkup(
      <SafeMarkdownAnswer
        answer="집결 장소는 7번 게이트입니다 [0d7d9db6-6352-48f3-b2e1-222cd34069c9]."
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
        answer="근거는 다음과 같습니다 [11111111-2222-4333-8444-555555555555]."
        citations={[citation]}
      />,
    );
    expect(html).not.toContain("11111111");
    expect(html).not.toContain("civic-citation-chip");
  });

  it("UUID 형식이 아닌 대괄호 텍스트는 유지한다", () => {
    const html = renderToStaticMarkup(
      <SafeMarkdownAnswer answer="조항 [부칙 3조] 참고" citations={[citation]} />,
    );
    expect(html).toContain("[부칙 3조]");
  });

  it("citationForMarker는 대소문자 구분 없이 인용을 찾는다", () => {
    expect(citationForMarker([citation], "[0D7D9DB6-6352-48F3-B2E1-222CD34069C9]")).toBe(citation);
    expect(citationForMarker([citation], "[11111111-2222-4333-8444-555555555555]")).toBeNull();
  });

  it("칩 라벨은 문서명과 페이지를 함께 쓴다", () => {
    expect(citationChipLabel(citation)).toBe("2026 복지정책 기본계획 p.3");
  });

  it("stripCitationMarkers는 잔여 마커와 이중 공백을 정리한다", () => {
    expect(
      stripCitationMarkers("첫 근거 [11111111-2222-4333-8444-555555555555] 그리고  둘째"),
    ).toBe("첫 근거 그리고 둘째");
  });
});
