import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  AdminSimulationScreen,
  ADMIN_SIMULATION_PATHS,
  buildAdminSimulationRequest,
  buildDefaultSimulationRunInput,
  requestAdminSimulationPreview,
  requestAdminSimulationStart,
} from "@/components/admin/admin-simulation-screen";
import { screenRegistry } from "@/lib/screens/registry";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("simulation setup", () => {
  it("정본 Simulation API에 taskId를 포함한 요청을 만든다", () => {
    const input = buildDefaultSimulationRunInput(10, {
      defaultModel: "anthropic/claude-sonnet-4.6",
      models: ["anthropic/claude-sonnet-4.6"],
      minPersonaCount: 10,
      maxPersonaCount: 100,
      filters: {
        genders: ["여성", "남성"],
        ageGroups: ["30대"],
        regions: ["전남", "광주"],
        politicalIdeologies: ["중도"],
      },
    });
    if (!input) throw new Error("Expected a valid default simulation input");

    expect(ADMIN_SIMULATION_PATHS).toEqual({
      create: "/api/v1/admin/simulations",
      preview: "/api/v1/admin/simulations/preview",
    });
    expect(buildAdminSimulationRequest("task-1", input)).toEqual({
      taskId: "task-1",
      modelType: "anthropic/claude-sonnet-4.6",
      personaCount: 10,
      sampleSeed: null,
      filters: { regions: ["전남", "광주"] },
    });
    expect(buildAdminSimulationRequest("task-1", input, "pricing-v1")).toEqual({
      taskId: "task-1",
      modelType: "anthropic/claude-sonnet-4.6",
      personaCount: 10,
      sampleSeed: null,
      filters: { regions: ["전남", "광주"] },
      pricingFingerprint: "pricing-v1",
    });
  });

  it("실행 요청은 정본 URL, taskId 본문과 멱등 키를 실제 fetch 경계에 전달한다", async () => {
    const input = buildDefaultSimulationRunInput(10, {
      defaultModel: "anthropic/claude-sonnet-4.6",
      models: ["anthropic/claude-sonnet-4.6"],
      minPersonaCount: 10,
      maxPersonaCount: 100,
      filters: {
        genders: ["여성", "남성"],
        ageGroups: ["30대"],
        regions: ["전남", "광주"],
        politicalIdeologies: ["중도"],
      },
    });
    if (!input) throw new Error("Expected a valid default simulation input");
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
    const request: typeof fetch = async (url, init) => {
      calls.push([url, init]);
      return new Response("{}", { status: 200 });
    };

    await requestAdminSimulationStart("task-1", input, "pricing-v1", "idempotency-1", request);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe("/api/v1/admin/simulations");
    expect(calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "idempotency-1",
      },
    });
    expect(JSON.parse(String(calls[0]?.[1]?.body))).toEqual({
      taskId: "task-1",
      modelType: "anthropic/claude-sonnet-4.6",
      personaCount: 10,
      sampleSeed: null,
      filters: { regions: ["전남", "광주"] },
      pricingFingerprint: "pricing-v1",
    });
  });

  it("미리보기 요청은 과업별 정본 URL과 taskId 본문을 실제 fetch 경계에 전달한다", async () => {
    const input = {
      modelType: "anthropic/claude-sonnet-4.6",
      personaCount: 10,
      sampleSeed: null,
    } as const;
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
    const request: typeof fetch = async (url, init) => {
      calls.push([url, init]);
      return new Response("{}", { status: 200 });
    };

    await requestAdminSimulationPreview("task-2", input, request);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe("/api/v1/admin/simulations/preview");
    expect(calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    expect(JSON.parse(String(calls[0]?.[1]?.body))).toEqual({
      taskId: "task-2",
      modelType: "anthropic/claude-sonnet-4.6",
      personaCount: 10,
      sampleSeed: null,
      filters: {},
    });
  });

  it("서버가 승인한 기본 모델과 null 시드로 실행 입력을 만든다", () => {
    const input = buildDefaultSimulationRunInput(10, {
      defaultModel: "anthropic/claude-sonnet-4.6",
      models: ["anthropic/claude-sonnet-4.6"],
      minPersonaCount: 10,
      maxPersonaCount: 100,
      filters: {
        genders: ["여성", "남성"],
        ageGroups: ["30대"],
        regions: ["전남", "광주"],
        politicalIdeologies: ["중도"],
      },
    });

    expect(input).toEqual({
      modelType: "anthropic/claude-sonnet-4.6",
      personaCount: 10,
      sampleSeed: null,
      filters: { regions: ["전남", "광주"] },
    });
  });

  it("관리자에게 페르소나 수만 받고 불필요한 안내와 실행 정책 입력은 숨긴다", () => {
    const screen = screenRegistry.find((candidate) => candidate.id === "A-SIM-002");
    if (!screen) throw new Error("Missing simulation setup screen");

    const html = renderToStaticMarkup(
      <AdminSimulationScreen screen={screen} query={{ taskId: "task-1" }} />,
    );

    expect(html).toContain("페르소나 수");
    expect(html).toContain("전남·광주 페르소나만 기준으로 계산");
    expect(html).not.toContain("가상 패널 수");
    expect(html).not.toContain("과업 단위 가상 패널 시뮬레이션");
    expect(html).not.toContain(
      "개별 CIVIC 사용자의 Persona 생성이나 사용자별 예측에는 사용되지 않습니다.",
    );
    expect(html).not.toContain("실행 모델");
    expect(html).not.toContain("표본 시드");
  });
});
