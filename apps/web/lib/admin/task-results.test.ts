import { describe, expect, it, vi } from "vitest";
import { canViewTaskResults, loadTaskResults, readTaskProgressSummary } from "./task-results";
import type { Task } from "./domain-contracts";

const taskId = "7e85d865-4616-4cf5-967c-7d23c27dbf4c";
const base = `/api/v1/admin/tasks/${taskId}`;
const progress = {
  taskId,
  status: "OPEN",
  observedAt: "2026-09-03T01:00:00Z",
  submissionCount: 3,
  options: [
    { optionId: "a", content: "찬성", count: 2, rate: 2 / 3 },
    { optionId: "b", content: "반대", count: 1, rate: 1 / 3 },
  ],
};
const finalSummary = {
  schemaVersion: "task-result-summary/v1",
  resultVersion: 1,
  responseCount: 3,
  options: [
    { key: "a", content: "찬성", count: 2 },
    { key: "b", content: "반대", count: 1 },
  ],
};

function detail(status: Task["status"] = "OPEN", closureType: Task["closureType"] = null) {
  return {
    task: {
      id: taskId,
      title: "정책 선호도 조사",
      description: "관리자 설명",
      status,
      closureType,
      schedule: null,
      publishedAt: null,
      openedAt: null,
      closedAt: null,
      createdAt: "2026-09-03T01:00:00Z",
      updatedAt: "2026-09-03T01:00:00Z",
      question: {
        id: "question",
        content: "어떤 안을 선호하시나요?",
        description: null,
        options: [
          { id: "a", displayOrder: 1, content: "찬성" },
          { id: "b", displayOrder: 2, content: "반대" },
        ],
      },
    },
    preparation: null,
    lifecycleHistory: [],
    capabilities: {
      canEditContent: false,
      canStartPreparation: false,
      canSchedule: false,
      canOpenNow: false,
    },
  };
}

describe("관리자 결과 탭 집계", () => {
  it("진행 중 집계의 순서와 비율을 보존하고 모든 요청을 no-store로 보낸다", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(detail()))
      .mockResolvedValueOnce(Response.json(progress));
    const result = await loadTaskResults(taskId, request);
    expect(result).toMatchObject({
      responseCount: 3,
      observedAt: progress.observedAt,
      options: [
        { key: "a", content: "찬성", count: 2, rate: 2 / 3 },
        { key: "b", count: 1, rate: 1 / 3 },
      ],
    });
    expect(request.mock.calls.map(([path]) => path)).toEqual([base, `${base}/progress-summary`]);
    for (const [, init] of request.mock.calls) expect(init?.cache).toBe("no-store");
  });

  it("0건에서도 모든 선택지를 0%로 반환한다", () => {
    expect(
      readTaskProgressSummary({
        ...progress,
        submissionCount: 0,
        options: progress.options.map((option) => ({ ...option, count: 0, rate: 0 })),
      }),
    ).toMatchObject({
      submissionCount: 0,
      options: [
        { count: 0, rate: 0 },
        { count: 0, rate: 0 },
      ],
    });
  });

  it.each([
    { submissionCount: 4 },
    { observedAt: "invalid" },
    { status: "CLOSED" },
    { options: [{ ...progress.options[0], rate: 67 }] },
    { options: [{ ...progress.options[0], rate: Number.NaN }] },
    { options: [{ ...progress.options[0], count: -1 }] },
    { options: [progress.options[0], { ...progress.options[1], optionId: "a" }] },
  ])("잘못된 집계 응답을 거부한다: %j", (patch) => {
    expect(readTaskProgressSummary({ ...progress, ...patch })).toBeNull();
  });

  it("다른 투표의 집계는 표시하지 않는다", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(detail()))
      .mockResolvedValueOnce(Response.json({ ...progress, taskId: "other" }));
    await expect(loadTaskResults(taskId, request)).rejects.toThrow("집계 응답 형식");
  });

  it.each(["DEADLINE_REACHED", "EARLY_CLOSED"] as const)(
    "%s 투표는 확정 결과를 사용한다",
    async (closure) => {
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(Response.json(detail("CLOSED", closure)))
        .mockResolvedValueOnce(Response.json(finalSummary));
      expect(await loadTaskResults(taskId, request)).toMatchObject({
        observedAt: null,
        responseCount: 3,
      });
      expect(request.mock.calls.map(([path]) => path)).toEqual([base, `${base}/result-summary`]);
    },
  );

  it("조회 도중 종료되어 409가 오면 상세를 재조회하고 확정 결과로 전환한다", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(detail()))
      .mockResolvedValueOnce(
        Response.json({ code: "TASK_PROGRESS_SUMMARY_NOT_AVAILABLE" }, { status: 409 }),
      )
      .mockResolvedValueOnce(Response.json(detail("CLOSED", "DEADLINE_REACHED")))
      .mockResolvedValueOnce(Response.json(finalSummary));
    expect(await loadTaskResults(taskId, request)).toMatchObject({
      observedAt: null,
      responseCount: 3,
    });
    expect(request.mock.calls.map(([path]) => path)).toEqual([
      base,
      `${base}/progress-summary`,
      base,
      `${base}/result-summary`,
    ]);
  });

  it.each(["DRAFT", "SCHEDULED", "CLOSED"] as const)(
    "%s 미발행·취소 투표는 집계를 호출하지 않는다",
    async (status) => {
      const current = detail(status, status === "CLOSED" ? "CANCELLED" : null);
      expect(canViewTaskResults(current.task)).toBe(false);
      const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(current));
      await expect(loadTaskResults(taskId, request)).rejects.toThrow("투표만 결과");
      expect(request).toHaveBeenCalledTimes(1);
    },
  );

  it("권한 오류를 0건 결과로 바꾸거나 확정 결과 API로 우회하지 않는다", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(detail()))
      .mockResolvedValueOnce(Response.json({ code: "FORBIDDEN" }, { status: 403 }));
    await expect(loadTaskResults(taskId, request)).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(2);
    expect(canViewTaskResults(detail().task)).toBe(true);
  });
});
