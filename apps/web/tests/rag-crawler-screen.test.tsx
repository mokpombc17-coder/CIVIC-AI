import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminRagCrawler, loadLatestCrawlRuns } from "@/components/rag/admin-rag-crawler";

describe("RAG 웹 수집 관리", () => {
  it("사람이 이해할 수 있는 수집 설정과 안전 한도를 표시한다", () => {
    const html = renderToStaticMarkup(
      createElement(AdminRagCrawler, {
        folders: [
          {
            folder_id: "11111111-1111-4111-8111-111111111111",
            parent_id: null,
            name: "정책 자료",
            kind: "NORMAL" as const,
            path: ["공통", "정책 자료"],
          },
        ],
      }),
    );

    expect(html).toContain("웹 문서 수집");
    expect(html).toContain("시작 주소");
    expect(html).toContain("저장 폴더");
    expect(html).toContain("최대 깊이");
    expect(html).toContain('max="5"');
    expect(html).toContain('max="500"');
    expect(html).toContain("매일");
    expect(html).toContain("로그인 필요 사이트 접속 확인");
    expect(html).toContain("쿠키");
    expect(html).toContain("Authorization 헤더");
    expect(html).toContain('type="password"');
    expect(html).not.toContain("지정 폴더의 검색 문서로 수집");
    expect(html).not.toContain("canonical_url_sha256");
    expect(html).not.toContain("safe_error_code");
  });

  it("기존 수집원의 가장 최근 실행 상태를 함께 불러온다", async () => {
    const requests: string[] = [];
    const runs = await loadLatestCrawlRuns(
      [{ source_id: "source-1" }, { source_id: "source-2" }],
      async (input) => {
        requests.push(String(input));
        const running = String(input).includes("source-1");
        return new Response(
          JSON.stringify({
            items: running
              ? [
                  {
                    run_id: "run-1",
                    state: "RUNNING",
                    discovered_count: 3,
                    ingested_count: 1,
                    skipped_count: 2,
                  },
                ]
              : [],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    );

    expect(requests).toEqual([
      "/api/v1/rag/crawler/sources/source-1/runs",
      "/api/v1/rag/crawler/sources/source-2/runs",
    ]);
    expect(runs["source-1"]?.state).toBe("RUNNING");
    expect(runs["source-2"]).toBeUndefined();
  });

  it("일부 실행 기록 조회가 실패해도 다른 수집원 상태는 유지한다", async () => {
    const runs = await loadLatestCrawlRuns(
      [{ source_id: "source-1" }, { source_id: "source-2" }],
      async (input) => {
        if (String(input).includes("source-2")) throw new TypeError("network failed");
        return Response.json({ items: [{ run_id: "run-1", state: "SUCCEEDED" }] });
      },
    );

    expect(runs["source-1"]?.state).toBe("SUCCEEDED");
    expect(runs["source-2"]).toBeUndefined();
  });
});
