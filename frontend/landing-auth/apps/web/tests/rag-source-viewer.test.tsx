import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReadOnlyPdfViewer } from "@/components/rag/read-only-pdf-viewer";

describe("read-only immutable citation viewer", () => {
  it("exact citation으로 승인한 전체 문서를 핀치 줌 가능한 연속 스크롤로 제공한다", () => {
    const html = renderToStaticMarkup(
      <ReadOnlyPdfViewer
        currentPage={3}
        documentTitle="합성 정책"
        sourceUrl={`/api/v1/rag/sources/version-1/pages/3`}
        totalPages={7}
      />,
    );

    expect(html).toContain("합성 정책 미리보기");
    expect(html).toContain('class="civic-pdf-toolbar-page"');
    expect(html).toContain("p. 3/7");
    expect(html).not.toContain("wf-rag-document-meta");
    expect(html).not.toContain("연속 스크롤");
    expect(html).toContain('data-pdf-scroll-mode="continuous"');
    expect(html).toContain('data-pdf-zoom-mode="pinch"');
    expect(html).not.toContain("data-document-zoom");
    expect(html).not.toContain("이전 페이지");
    expect(html).not.toContain("다음 페이지");
    expect(html).not.toContain('aria-label="문서 확대/축소 도구"');
    expect(html).not.toContain('aria-label="문서 확대"');
    expect(html).not.toContain('aria-label="문서 축소"');
    expect(html).not.toContain("화면 맞춤");
    expect(html).toContain("참조 문서 닫기");
    expect(html).toContain("문서 접근 권한을 확인하고 있습니다.");
    expect(html).not.toContain("/api/v1/rag/sources/version-1/pages/3");
    expect(html).not.toContain("<iframe");
    expect(html).not.toMatch(/\sdownload(?:=|\s|>)/);
    expect(html).not.toContain('target="_blank"');
    expect(html).not.toContain("URL.createObjectURL");
    expect(html).not.toMatch(/<iframe[^>]*\ssandbox(?:=|\s|>)/);
  });

  it("대화 안의 인용 뷰어는 페이지 버튼 없이 닫기 콜백만 제공한다", () => {
    const html = renderToStaticMarkup(
      <ReadOnlyPdfViewer
        currentPage={3}
        documentTitle="정책.pdf"
        onClose={() => undefined}
        sourceUrl="/api/v1/rag/sources/version-1/pages/3"
        totalPages={7}
      />,
    );

    expect(html).not.toContain("연속 스크롤");
    expect(html).not.toContain("PDF 페이지 도구");
    expect(html).not.toContain("/rag/source/page?");
    expect(html).not.toContain('href="/rag"');
  });

  it("문서 목록 미리보기도 페이지 PNG를 같은 연속 스크롤 viewer에서 연다", () => {
    const html = renderToStaticMarkup(
      <ReadOnlyPdfViewer
        currentPage={1}
        documentTitle="정책자료.pdf"
        onClose={() => undefined}
        sourceUrl="/api/v1/rag/sources/version-1/pages/1"
        totalPages={12}
      />,
    );

    expect(html).toContain("정책자료.pdf 미리보기");
    expect(html).toContain("p. 1/12");
    expect(html).toContain("문서 접근 권한을 확인하고 있습니다.");
    expect(html).toContain('data-pdf-scroll-mode="continuous"');
    expect(html).not.toContain("<iframe");
  });

  it.each(["설계.drawio.png", "운영지침.hwp", "정책표.xlsx"])(
    "%s 변환 문서에도 동일한 핀치 줌을 제공한다",
    (documentTitle) => {
      const html = renderToStaticMarkup(
        <ReadOnlyPdfViewer
          currentPage={1}
          documentTitle={documentTitle}
          sourceUrl="/api/v1/rag/sources/version-1/pages/1"
          totalPages={1}
        />,
      );

      expect(html).toContain(`${documentTitle} 읽기 전용 문서`);
      expect(html).toContain('data-pdf-zoom-mode="pinch"');
      expect(html).not.toContain('aria-label="문서 확대/축소 도구"');
    },
  );
});
