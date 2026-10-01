import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  activeSimulation,
  AdminVoteSimulationScreen,
} from "@/components/admin/vote-simulation-workspace";
import { screenRegistry } from "@/lib/screens/registry";
import type { SimulationView } from "@/lib/admin/simulation-contracts";

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
});
