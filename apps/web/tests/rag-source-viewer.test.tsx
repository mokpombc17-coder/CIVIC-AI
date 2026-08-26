import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { pageHref, ReadOnlyPdfViewer } from "@/components/rag/read-only-pdf-viewer";

describe("read-only immutable citation viewer", () => {
  it("exact version/page source URL과 키보드 가능한 이동만 제공한다", () => {
    const html = renderToStaticMarkup(
      <ReadOnlyPdfViewer
        currentPage={3}
        documentTitle="합성 정책"
        sourceUrl={`/api/v1/rag/sources/version-1/pages/3`}
        totalPages={7}
      />,
    );

    expect(html).toContain("합성 정책");
    expect(html).toContain("3 / 7");
    expect(html).toContain("이전 페이지");
    expect(html).toContain("다음 페이지");
    expect(html).toContain("확대");
    expect(html).toContain("축소");
    expect(html).toContain("참조 문서 닫기");
    expect(html).toContain("문서 접근 권한을 확인하고 있습니다.");
    expect(html).not.toContain("/api/v1/rag/sources/version-1/pages/3");
    expect(html).not.toContain("<iframe");
    expect(html).not.toMatch(/\sdownload(?:=|\s|>)/);
    expect(html).not.toContain('target="_blank"');
    expect(html).not.toContain("URL.createObjectURL");
    expect(html).not.toMatch(/<iframe[^>]*\ssandbox(?:=|\s|>)/);
  });

  it("이미 인코딩된 버전 ID를 한 번만 인코딩한다", () => {
    expect(pageHref("/api/v1/rag/sources/version%2F1/pages/3", 4, "정책.pdf", 7)).toBe(
      "/rag/source/page?versionId=version%2F1&page=4&title=%EC%A0%95%EC%B1%85.pdf&total=7",
    );
  });

  it("대화 안의 인용 뷰어는 페이지 이동과 닫기를 링크가 아닌 콜백으로 처리한다", () => {
    const html = renderToStaticMarkup(
      <ReadOnlyPdfViewer
        currentPage={3}
        documentTitle="정책.pdf"
        onClose={() => undefined}
        onPageChange={() => undefined}
        sourceUrl="/api/v1/rag/sources/version-1/pages/3"
        totalPages={7}
      />,
    );

    expect(html).toContain('data-page-target="2"');
    expect(html).toContain('data-page-target="4"');
    expect(html).not.toContain("/rag/source/page?");
    expect(html).not.toContain('href="/rag"');
  });
});
