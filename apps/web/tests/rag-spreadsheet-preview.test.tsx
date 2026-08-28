import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AdminRagSpreadsheetPreview,
  spreadsheetRowsPath,
  spreadsheetSheetsPath,
} from "@/components/rag/admin-rag-spreadsheet-preview";

describe("RAG 표 문서 미리보기", () => {
  it("로딩 중에도 읽기 전용 표 미리보기임을 명확히 표시한다", () => {
    const html = renderToStaticMarkup(
      createElement(AdminRagSpreadsheetPreview, {
        documentId: "document-1",
        versionId: "version-1",
      }),
    );

    expect(html).toContain("표 데이터 미리보기");
    expect(html).toContain("읽기 전용");
  });

  it("시트와 행 경로를 인코딩하고 페이지 크기를 제한한다", () => {
    expect(spreadsheetSheetsPath("doc/1", "version/1")).toBe(
      "/api/v1/rag/documents/doc%2F1/versions/version%2F1/sheets",
    );
    expect(spreadsheetRowsPath("doc/1", "version/1", "sheet/1", 2, 5000)).toBe(
      "/api/v1/rag/documents/doc%2F1/versions/version%2F1/sheets/sheet%2F1/rows?page=2&page_size=1000",
    );
  });
});
