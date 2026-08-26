import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  AdminRagAnalytics,
  downloadRagConversationJsonl,
  ragConversationExportHref,
  uniqueRagConversationExportId,
} from "@/components/rag/admin-rag-analytics";
import { RagFeedback, submitRagFeedback } from "@/components/rag/rag-feedback";

describe("RAG 평가와 운영 분석", () => {
  it("참여자 평가는 도움됨·도움 안 됨만 제공하고 값을 교체한다", async () => {
    const html = renderToStaticMarkup(
      createElement(RagFeedback, { jobId: "job-1", initialValue: "HELPFUL" }),
    );
    const request = vi.fn(async () => Response.json({ value: "UNHELPFUL" }));

    await expect(submitRagFeedback("job-1", "UNHELPFUL", request as typeof fetch)).resolves.toBe(
      "UNHELPFUL",
    );
    expect(html).toContain("도움됨");
    expect(html).toContain("도움 안 됨");
    expect(html).toContain('aria-pressed="true"');
    expect(html).not.toContain("textarea");
    expect(request).toHaveBeenCalledWith(
      "/api/v1/rag/queries/job-1/feedback",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("관리자 화면은 집계와 실제 RAG 대화 JSONL 내보내기를 분리해 제공한다", () => {
    const html = renderToStaticMarkup(createElement(AdminRagAnalytics));

    expect(html).toContain("RAG 운영 지표");
    expect(html).toContain("질의 수");
    expect(html).toContain("평균 응답시간");
    expect(html).toContain("도움됨");
    expect(html).toContain("3건 미만");
    expect(html).toContain("조회 기간 대화 JSONL");
    expect(html).toContain("전체 대화 JSONL");
    expect(html).toContain("실제 사용자 질문·AI 답변");
    expect(html).not.toContain("사용자 ID");
    expect(html).not.toContain("UUID");
    expect(html).not.toContain("사용자 이메일");
    expect(html).not.toContain("API key");
  });

  it("대화 export URL은 선택한 사용자와 기간만 직렬화한다", () => {
    expect(
      ragConversationExportHref({
        subject: " 22222222-2222-4222-8222-222222222222 ",
        from: "2026-08-01",
        to: "2026-08-25",
      }),
    ).toBe(
      "/api/v1/rag/conversations/export?subject=22222222-2222-4222-8222-222222222222&from=2026-08-01&to=2026-08-25",
    );
    expect(ragConversationExportHref({})).toBe("/api/v1/rag/conversations/export");
  });

  it("대화 JSONL은 웹과 네이티브가 공유하는 다운로드 경계를 사용한다", async () => {
    const download = vi.fn(async () => undefined);

    await downloadRagConversationJsonl(
      { subject: "22222222-2222-4222-8222-222222222222" },
      download,
      "https://civic.example",
      "export-1",
    );

    expect(download).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://civic.example/api/v1/rag/conversations/export?subject=22222222-2222-4222-8222-222222222222",
        mimeType: "application/x-ndjson",
        fileName: expect.stringMatching(/-export-1\.jsonl$/u),
        requiresAuthentication: true,
      }),
    );
  });

  it("동시 native cache 충돌을 피하도록 export마다 고유 ID를 만든다", () => {
    expect(uniqueRagConversationExportId()).not.toBe(uniqueRagConversationExportId());
  });
});
