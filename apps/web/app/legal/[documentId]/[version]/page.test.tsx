import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import LegalDocumentPage from "./page";

describe("LegalDocumentPage", () => {
  it("문서 추적 메타데이터는 유지하면서 버전 표시는 노출하지 않는다", async () => {
    const page = await LegalDocumentPage({
      params: Promise.resolve({ documentId: "terms", version: "3" }),
    });
    const html = renderToStaticMarkup(page);

    expect(html).toContain('data-document-version="3"');
    expect(html).toContain("시행일");
    expect(html).not.toContain("고정 문서 · 버전 3");
  });
});
