import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  documentKindLabel,
  parseParticipantDocumentCatalog,
  PARTICIPANT_DOCUMENT_CATALOG_PATH,
  ParticipantDocumentCatalog,
} from "@/components/rag/participant-document-catalog";

describe("participant document catalog", () => {
  it("참여자 전용 랜덤 문서 목록 경로를 사용한다", () => {
    expect(PARTICIPANT_DOCUMENT_CATALOG_PATH).toBe("/api/v1/rag/documents/random");
  });

  it("handoff 응답의 필수 필드를 보존한다", () => {
    expect(
      parseParticipantDocumentCatalog({
        items: [
          {
            document_id: "11111111-1111-4111-8111-111111111111",
            document_version_id: "22222222-2222-4222-8222-222222222222",
            filename: "정책자료.pdf",
            media_type: "application/pdf",
            page_count: 2,
            created_at: "2026-09-18T00:00:00Z",
          },
        ],
      }),
    ).toEqual([
      {
        document_id: "11111111-1111-4111-8111-111111111111",
        document_version_id: "22222222-2222-4222-8222-222222222222",
        filename: "정책자료.pdf",
        media_type: "application/pdf",
        page_count: 2,
        created_at: "2026-09-18T00:00:00Z",
      },
    ]);
  });

  it.each([
    { name: "응답 객체", value: {} },
    { name: "필수 필드", value: { items: [{ filename: "정책자료.pdf" }] } },
    {
      name: "페이지 수",
      value: {
        items: [
          {
            document_id: "document-1",
            document_version_id: "version-1",
            filename: "정책자료.pdf",
            media_type: "application/pdf",
            page_count: 0,
            created_at: "2026-09-18T00:00:00Z",
          },
        ],
      },
    },
    {
      name: "최대 문서 수",
      value: {
        items: Array.from({ length: 4 }, (_, index) => ({
          document_id: `document-${index}`,
          document_version_id: `version-${index}`,
          filename: `정책자료-${index}.pdf`,
          media_type: "application/pdf",
          page_count: 1,
          created_at: "2026-09-18T00:00:00Z",
        })),
      },
    },
  ])("잘못된 $name 형식을 거부한다", ({ value }) => {
    expect(() => parseParticipantDocumentCatalog(value)).toThrow(TypeError);
  });

  it("확장자는 짧은 문서 종류 라벨로 표시한다", () => {
    expect(documentKindLabel("정책자료.pdf")).toBe("PDF");
    expect(documentKindLabel("회의록.hwpx")).toBe("HWPX");
    expect(documentKindLabel("확장자없음")).toBe("문서");
  });

  it("첫 렌더에서 composer 위에 안정적인 목록 skeleton을 제공한다", () => {
    const html = renderToStaticMarkup(<ParticipantDocumentCatalog />);

    expect(html).toContain("어떤 점이 궁금한가요?");
    expect(html).toContain("관심 가는 문서에 대해 자유롭게 질문해 보세요.");
    expect(html).not.toContain("AI가 참고하는 자료");
    expect(html).toContain("참고 문서를 불러오는 중");
    expect(html.match(/is-loading/gu)).toHaveLength(3);
    expect(html).not.toContain(PARTICIPANT_DOCUMENT_CATALOG_PATH);
  });
});
