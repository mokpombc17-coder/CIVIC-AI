import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  loadSimulationTarget,
  scenarioRow,
  voteSimulationRow,
  SimulationScenarioEditor,
} from "@/components/admin/simulation-scenario-panels";
import { formatDifference } from "@/components/admin/vote-simulation-comparison";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const id = "71000000-0000-4000-8000-000000000001";
const option = (n: number) => ({
  id: `71000000-0000-4000-8000-00000000000${n}`,
  displayOrder: n,
  content: `선택 ${n}`,
});

const scenario = {
  scenarioId: id,
  title: "독립 시뮬레이션",
  description: null,
  question: {
    id: option(9).id,
    content: "질문",
    description: null,
    options: [option(2), option(1)],
  },
  sourceTaskId: null,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  latestSimulation: null,
};

describe("simulation scenario panels", () => {
  it("시나리오 ID면 시나리오를, 404면 투표 상세를 대상으로 읽는다", async () => {
    const scenarioRequest = vi.fn(async () => Response.json(scenario));
    await expect(loadSimulationTarget(id, scenarioRequest as typeof fetch)).resolves.toMatchObject({
      kind: "scenario",
      title: "독립 시뮬레이션",
    });
    expect(scenarioRequest).toHaveBeenCalledTimes(1);

    const voteRequest = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("simulation-scenarios"))
        return Response.json({ status: 404 }, { status: 404 });
      return Response.json({
        task: {
          id,
          title: "투표",
          status: "OPEN",
          createdAt: "2026-10-01T00:00:00Z",
          updatedAt: "2026-10-01T00:00:00Z",
          description: null,
          question: {
            id: option(9).id,
            content: "질문",
            description: null,
            options: [option(2), option(1)],
          },
          schedule: null,
          closedAt: null,
          closureType: null,
          openedAt: null,
          publishedAt: null,
        },
        preparation: null,
        capabilities: {
          canEditContent: false,
          canStartPreparation: false,
          canSchedule: false,
          canOpenNow: false,
        },
        lifecycleHistory: [],
      });
    });
    const target = await loadSimulationTarget(id, voteRequest as typeof fetch);
    expect(target.kind).toBe("vote");
    expect(target.options.map((item) => item.content)).toEqual(["선택 1", "선택 2"]);
    expect(String(voteRequest.mock.calls[1]?.[0])).toBe(`/api/v1/admin/simulation-tasks/${id}`);
  });

  it("시나리오 조회가 404 외의 오류면 투표로 넘어가지 않는다", async () => {
    const request = vi.fn(async () => Response.json({ status: 503 }, { status: 503 }));
    await expect(loadSimulationTarget(id, request as typeof fetch)).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("미실행 시나리오는 설정 화면으로 연결한다", () => {
    expect(scenarioRow(scenario)).toMatchObject({
      stateLabel: "미실행",
      href: `/admin/simulations/setup?taskId=${id}`,
    });
  });

  it("투표 기반 목록은 실행 이력이 있는 투표만 담고 완료 결과는 투표 비교로 연결한다", () => {
    const summary = {
      taskId: id,
      title: "투표",
      status: "OPEN" as const,
      createdAt: "2026-10-01T00:00:00Z",
      updatedAt: "2026-10-01T00:00:00Z",
      closedAt: null,
      closureType: null,
      openedAt: null,
      publishedAt: null,
      schedule: null,
    };
    const run = {
      simulationId: "71000000-0000-4000-8000-0000000000aa",
      taskId: id,
      state: "COMPLETED" as const,
      personaCount: 100,
      progressPercent: 100,
      cancelRequested: false,
      errorCode: null,
      resumeAt: null,
      retryAvailableAt: null,
      waitReason: null,
      createdAt: "2026-10-01T00:00:00Z",
      startedAt: "2026-10-01T00:00:00Z",
      completedAt: "2026-10-01T00:05:00Z",
      deadlineAt: "2026-10-01T01:00:00Z",
      estimatedCompletionAt: null,
      canCancel: false,
    };
    expect(voteSimulationRow({ ...summary, latestSimulation: null })).toBeNull();
    expect(voteSimulationRow({ ...summary, latestSimulation: run })).toMatchObject({
      stateLabel: "완료",
      href: `/admin/tasks/results?taskId=${id}`,
    });
    expect(
      voteSimulationRow({ ...summary, latestSimulation: { ...run, state: "RUNNING" } })?.href,
    ).toBe(`/admin/simulations/status?simulationId=${run.simulationId}`);
  });

  it("작성 폼에 투표 불러오기와 선택지 편집을 제공한다", () => {
    const html = renderToStaticMarkup(<SimulationScenarioEditor />);
    expect(html).toContain("투표에서 불러오기");
    expect(html).toContain("선택지 1");
    expect(html).toContain("저장하고 실행 설정으로");
  });

  it("차이를 부호가 있는 %p로 표시한다", () => {
    expect(formatDifference(15)).toBe("+15.0%p");
    expect(formatDifference(-2.04)).toBe("−2.0%p");
    expect(formatDifference(0.01)).toBe("0.0%p");
  });
});
