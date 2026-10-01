import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  activeSimulation,
  AdminVoteSimulationScreen,
} from "@/components/admin/vote-simulation-workspace";
import {
  VoteSimulationOptionTable,
  VoteSimulationSummary,
} from "@/components/admin/vote-simulation-analysis";
import { screenRegistry } from "@/lib/screens/registry";
import type {
  SimulationResult,
  SimulationView,
  VoteSimulationComparisonRow,
} from "@/lib/admin/simulation-contracts";
import type { TaskResults } from "@/lib/admin/task-results";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

function run(id: string, state: SimulationView["state"], createdAt: string): SimulationView {
  return {
    simulationId: id,
    taskId: "72000000-0000-4000-8000-000000000001",
    state,
    personaCount: 100,
    progressPercent: 10,
    cancelRequested: false,
    errorCode: null,
    resumeAt: null,
    retryAvailableAt: null,
    waitReason: null,
    createdAt,
    startedAt: createdAt,
    completedAt: null,
    deadlineAt: createdAt,
    estimatedCompletionAt: null,
    canCancel: true,
  };
}

describe("vote simulation workspace", () => {
  it("가장 최근의 진행 중 실행을 고른다", () => {
    expect(
      activeSimulation([
        run("a", "COMPLETED", "2026-10-01T03:00:00Z"),
        run("b", "RUNNING", "2026-10-01T01:00:00Z"),
        run("c", "WAITING_PROVIDER", "2026-10-01T02:00:00Z"),
      ])?.simulationId,
    ).toBe("c");
    expect(activeSimulation([run("a", "FAILED", "2026-10-01T03:00:00Z")])).toBeNull();
  });

  it("좌측 실제 투표·우측 AI 시뮬레이션과 바로 실행 영역을 한 화면에 둔다", () => {
    const screen = screenRegistry.find((candidate) => candidate.id === "A-SIM-001");
    if (!screen) throw new Error("Missing simulation screen");
    const html = renderToStaticMarkup(
      <AdminVoteSimulationScreen screen={screen} taskId="72000000-0000-4000-8000-000000000001" />,
    );
    expect(html).toContain("투표 기반 시뮬레이션");
    expect(html.indexOf('aria-label="실제 투표 결과"')).toBeLessThan(
      html.indexOf('aria-label="AI 시뮬레이션 결과"'),
    );
    expect(html).toContain("시뮬레이션 실행");
  });

  it("투표가 지정되지 않으면 목록으로 돌아가는 안내를 보여준다", () => {
    const screen = screenRegistry.find((candidate) => candidate.id === "A-SIM-001");
    if (!screen) throw new Error("Missing simulation screen");
    const html = renderToStaticMarkup(<AdminVoteSimulationScreen screen={screen} taskId={null} />);
    expect(html).toContain("시뮬레이션할 투표를 선택해 주세요.");
  });

  it("비교 요약과 선택지별 실제·AI 비율 및 차이를 함께 보여준다", () => {
    const rows: VoteSimulationComparisonRow[] = [
      {
        optionId: "O1",
        content: "찬성",
        voteCount: 7,
        voteRate: 70,
        simulationCount: 62,
        simulationRate: 62,
        differencePoints: -8,
      },
      {
        optionId: "O2",
        content: "반대",
        voteCount: 3,
        voteRate: 30,
        simulationCount: 38,
        simulationRate: 38,
        differencePoints: 8,
      },
    ];
    const result = { denominators: { total: 100, filtered: 100 } } as unknown as SimulationResult;
    const vote = { responseCount: 10 } as unknown as TaskResults;
    const html = renderToStaticMarkup(
      <>
        <VoteSimulationSummary result={result} rows={rows} vote={vote} />
        <VoteSimulationOptionTable rows={rows} />
      </>,
    );
    expect(html).toContain("일치");
    expect(html).not.toContain("불일치");
    expect(html).toContain("8.0%p");
    expect(html).toContain("10 : 100");
    expect(html).toContain("선택지별 비교");
    expect(html).toContain("−8.0%p");
  });
});
