import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  AdminSimulationScreen,
  buildDefaultSimulationRunInput,
} from "@/components/admin/admin-simulation-screen";
import { screenRegistry } from "@/lib/screens/registry";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("simulation setup", () => {
  it("서버가 승인한 기본 모델과 null 시드로 실행 입력을 만든다", () => {
    const input = buildDefaultSimulationRunInput(10, {
      defaultModel: "anthropic/claude-sonnet-4.6",
      models: ["anthropic/claude-sonnet-4.6"],
      minPersonaCount: 10,
      maxPersonaCount: 100,
      filters: {
        genders: ["여성", "남성"],
        ageGroups: ["30대"],
      },
    });

    expect(input).toEqual({
      modelType: "anthropic/claude-sonnet-4.6",
      personaCount: 10,
      sampleSeed: null,
    });
  });

  it("관리자에게 패널 수만 받고 모델과 표본 시드는 서버 정책으로 적용한다", () => {
    const screen = screenRegistry.find((candidate) => candidate.id === "A-SIM-002");
    if (!screen) throw new Error("Missing simulation setup screen");

    const html = renderToStaticMarkup(
      <AdminSimulationScreen screen={screen} query={{ taskId: "task-1" }} />,
    );

    expect(html).toContain("가상 패널 수");
    expect(html).not.toContain("실행 모델");
    expect(html).not.toContain("표본 시드");
  });
});
