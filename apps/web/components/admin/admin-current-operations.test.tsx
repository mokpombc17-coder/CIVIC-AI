import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  AdminCurrentOperationsView,
  loadAdminCurrentOperations,
} from "@/components/admin/admin-current-operations";

const taskId = "13000000-0000-4000-8000-000000000001";
const simulationId = "23000000-0000-4000-8000-000000000001";
const rootFolderId = "33000000-0000-4000-8000-000000000001";

describe("admin current operations", () => {
  it("시뮬레이션과 문서의 진행 작업을 병렬 소스에서 합친다", async () => {
    const request = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/v1/admin/simulation-tasks") {
        return Response.json([
          simulationTask("RUNNING", 68),
          {
            ...simulationTask("COMPLETED", 100),
            taskId: "13000000-0000-4000-8000-000000000002",
            title: "완료된 과업",
            latestSimulation: {
              ...simulationTask("COMPLETED", 100).latestSimulation,
              simulationId: "23000000-0000-4000-8000-000000000002",
              taskId: "13000000-0000-4000-8000-000000000002",
            },
          },
        ]);
      }
      if (url === "/api/v1/rag/folders") {
        return Response.json({
          items: [{ folder_id: rootFolderId, parent_id: null, name: "문서", kind: "ROOT" }],
        });
      }
      if (url.includes("status=PENDING")) {
        return Response.json({
          items: [ragDocument("document-pending", "처리대기.pdf", "QUEUED", 12)],
          total: 1,
        });
      }
      if (url.includes("status=PROCESSING")) {
        return Response.json({
          items: [ragDocument("document-running", "색인중.hwpx", "RUNNING", 72)],
          total: 1,
        });
      }
      return new Response(null, { status: 404 });
    });

    const result = await loadAdminCurrentOperations({
      canManageSimulation: true,
      canReadRag: true,
      request: request as typeof fetch,
    });

    expect(result.total).toBe(3);
    expect(result.unavailableSources).toEqual([]);
    expect(result.items.map((item) => item.title)).toEqual([
      "색인중.hwpx",
      "처리대기.pdf",
      "지역 교통정책 조사",
    ]);
    expect(result.items.find((item) => item.kind === "simulation")).toMatchObject({
      href: `/admin/simulations/status?simulationId=${simulationId}`,
      progressPercent: 68,
      stage: "실행 중",
    });
    expect(result.items.find((item) => item.title === "색인중.hwpx")).toMatchObject({
      href: `/admin/rag/jobs?jobId=job-document-running&filename=%EC%83%89%EC%9D%B8%EC%A4%91.hwpx&folderId=${rootFolderId}`,
      progressPercent: 72,
      stage: "처리 중",
    });
    expect(request).toHaveBeenCalledWith("/api/v1/admin/simulation-tasks", {
      cache: "no-store",
    });
    expect(request).toHaveBeenCalledWith("/api/v1/rag/folders", { cache: "no-store" });
    expect(request.mock.calls.map(([url]) => String(url))).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`folder_id=${rootFolderId}&include_subfolders=true`),
        expect.stringContaining("status=PENDING"),
        expect.stringContaining("status=PROCESSING"),
      ]),
    );
  });

  it("권한이 있는 소스만 조회하고 진행 작업이 없으면 안정적인 빈 상태를 만든다", async () => {
    const request = vi.fn(async () => Response.json([simulationTask("COMPLETED", 100)]));

    const result = await loadAdminCurrentOperations({
      canManageSimulation: true,
      canReadRag: false,
      request: request as typeof fetch,
    });
    const html = renderToStaticMarkup(createElement(AdminCurrentOperationsView, { state: result }));

    expect(request).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ status: "ready", total: 0, items: [] });
    expect(html).toContain("현재 처리 중인 작업이 없습니다.");
  });

  it("일부 소스 조회가 실패해도 확인된 진행 작업은 유지한다", async () => {
    const request = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/v1/rag/folders") return new Response(null, { status: 503 });
      return Response.json([simulationTask("WAITING_PROVIDER", 44)]);
    });

    const result = await loadAdminCurrentOperations({
      canManageSimulation: true,
      canReadRag: true,
      request: request as typeof fetch,
    });
    const html = renderToStaticMarkup(createElement(AdminCurrentOperationsView, { state: result }));

    expect(result.unavailableSources).toEqual(["문서"]);
    expect(result.items).toHaveLength(1);
    expect(html).toContain("공급자 응답 대기");
    expect(html).toContain("문서 처리 현황은 불러오지 못했습니다.");
  });
});

function simulationTask(
  state: "RUNNING" | "WAITING_PROVIDER" | "COMPLETED",
  progressPercent: number,
) {
  return {
    taskId,
    title: "지역 교통정책 조사",
    status: "OPEN",
    schedule: null,
    publishedAt: "2026-08-29T10:00:00Z",
    openedAt: "2026-08-29T10:00:00Z",
    closedAt: null,
    closureType: null,
    createdAt: "2026-08-29T10:00:00Z",
    updatedAt: "2026-08-29T10:00:00Z",
    latestSimulation: {
      simulationId,
      taskId,
      state,
      personaCount: 800,
      progressPercent,
      cancelRequested: false,
      errorCode: null,
      resumeAt: null,
      retryAvailableAt: null,
      waitReason: null,
      createdAt: "2026-08-29T10:00:00Z",
      startedAt: "2026-08-29T10:00:01Z",
      completedAt: state === "COMPLETED" ? "2026-08-29T10:10:00Z" : null,
      deadlineAt: "2026-08-29T11:00:00Z",
      estimatedCompletionAt: state === "COMPLETED" ? null : "2026-08-29T10:20:00Z",
      canCancel: state !== "COMPLETED",
      estimatedKrw: 10_000,
      holdKrw: 12_000,
      settledKrw: state === "COMPLETED" ? 9_500 : null,
      absorbedKrw: 0,
      billingState: state === "COMPLETED" ? "SETTLED" : "HELD",
    },
  };
}

function ragDocument(id: string, filename: string, status: string, progress: number) {
  return {
    document_id: id,
    folder_id: rootFolderId,
    filename,
    created_at: "2026-08-29T11:00:00Z",
    updated_at: status === "RUNNING" ? "2026-08-29T11:02:00Z" : "2026-08-29T11:01:00Z",
    deleted: false,
    active_version: {
      document_version_id: `version-${id}`,
      document_id: id,
      filename,
      status: status === "QUEUED" ? "PENDING" : "PROCESSING",
      job_id: `job-${id}`,
      processing: { status, progress, failure_code: null },
    },
  };
}
