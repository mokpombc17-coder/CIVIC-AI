import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  AdminSimulationScreen,
  ADMIN_SIMULATION_PATHS,
  buildAdminSimulationRequest,
  buildDefaultSimulationRunInput,
  initialRunSetup,
  loadLatestRunSettings,
  requestAdminSimulationPreview,
  requestAdminSimulationStart,
  SimulationPreviewCard,
  SimulationSetup,
  simulationRunPath,
  simulationRunStageForScreen,
} from "@/components/admin/admin-simulation-screen";
import { screenRegistry } from "@/lib/screens/registry";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("simulation setup", () => {
  it("정본 Simulation API에 taskId를 포함한 요청을 만든다", () => {
    const input = buildDefaultSimulationRunInput(100, {
      defaultModel: "anthropic/claude-sonnet-4.6",
      models: ["anthropic/claude-sonnet-4.6"],
      minPersonaCount: 20,
      maxPersonaCount: 800,
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
      personaCount: 100,
      sampleSeed: null,
      filters: { regions: ["전남", "광주"] },
    });
    expect(buildAdminSimulationRequest("task-1", input, "pricing-v1")).toEqual({
      taskId: "task-1",
      modelType: "anthropic/claude-sonnet-4.6",
      personaCount: 100,
      sampleSeed: null,
      filters: { regions: ["전남", "광주"] },
      pricingFingerprint: "pricing-v1",
    });
  });

  it("실행 요청은 정본 URL, taskId 본문과 멱등 키를 실제 fetch 경계에 전달한다", async () => {
    const input = buildDefaultSimulationRunInput(100, {
      defaultModel: "anthropic/claude-sonnet-4.6",
      models: ["anthropic/claude-sonnet-4.6"],
      minPersonaCount: 20,
      maxPersonaCount: 800,
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
      personaCount: 100,
      sampleSeed: null,
      filters: { regions: ["전남", "광주"] },
      pricingFingerprint: "pricing-v1",
    });
  });

  it("미리보기 요청은 투표별 정본 URL과 taskId 본문을 실제 fetch 경계에 전달한다", async () => {
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
    const input = buildDefaultSimulationRunInput(100, {
      defaultModel: "anthropic/claude-sonnet-4.6",
      models: ["anthropic/claude-sonnet-4.6"],
      minPersonaCount: 20,
      maxPersonaCount: 800,
      filters: {
        genders: ["여성", "남성"],
        ageGroups: ["30대"],
        regions: ["전남", "광주"],
        politicalIdeologies: ["중도"],
      },
    });

    expect(input).toEqual({
      modelType: "anthropic/claude-sonnet-4.6",
      personaCount: 100,
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
    expect(html).not.toContain("전남·광주 페르소나만 기준으로 계산");
    expect(html).toContain("최소 100명 이상 최대 800명 이하");
    expect(html).toContain("가능한 페르소나 수");
    expect(html).not.toContain("투표 단위 가상 패널 시뮬레이션");
    expect(html).not.toContain(
      "개별 CIVIC 사용자의 Persona 생성이나 사용자별 예측에는 사용되지 않습니다.",
    );
    expect(html).not.toContain("실행 모델");
    expect(html).not.toContain("표본 시드");
    expect(html).toContain('aria-label="시뮬레이션 실행 단계"');
    expect(html).toContain(">동작</button>");
  });

  it("같은 대상의 실행이 진행 중이면 실행 버튼을 막고 이유를 보여준다", () => {
    const html = renderToStaticMarkup(
      <SimulationSetup
        onStarted={vi.fn()}
        query={{}}
        runBlockedReason="진행 중인 시뮬레이션이 끝나면 다시 실행할 수 있습니다."
        taskId="task-1"
      />,
    );
    expect(html).toContain("진행 중인 시뮬레이션이 끝나면 다시 실행할 수 있습니다.");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*type="submit"/u);
  });

  it("화면 ID와 단계별 정본 경로를 유지한다", () => {
    expect(simulationRunStageForScreen("A-SIM-002")).toBe("setup");
    expect(simulationRunStageForScreen("A-SIM-003")).toBe("setup");
    expect(simulationRunStageForScreen("A-SIM-004")).toBe("status");
    expect(simulationRunStageForScreen("A-SIM-005")).toBe("status");
    expect(simulationRunStageForScreen("A-SIM-006")).toBe("results");
    expect(simulationRunStageForScreen("A-SIM-007")).toBe("results");

    expect(simulationRunPath("setup", "task-1", null)).toBe(
      "/admin/simulations/setup?taskId=task-1",
    );
    expect(simulationRunPath("status", "task-1", "sim-1")).toBe(
      "/admin/simulations/status?simulationId=sim-1",
    );
    expect(simulationRunPath("results", null, "sim-1")).toBe(
      "/admin/simulations/results?simulationId=sim-1",
    );
  });

  it("페르소나 선정 조건은 설정 단계 안에서 선택 섹션으로 제공한다", () => {
    const screen = screenRegistry.find((candidate) => candidate.id === "A-SIM-002");
    if (!screen) throw new Error("Missing simulation setup screen");

    const html = renderToStaticMarkup(
      <AdminSimulationScreen screen={screen} query={{ taskId: "task-1" }} />,
    );

    expect(html).toContain("페르소나 선정 (선택)");
    expect(html).not.toContain("거주 지역은 전남·광주로 고정됩니다.");
  });

  it("예상 비용에는 실행 결정에 필요한 값만 표시한다", () => {
    const html = renderToStaticMarkup(
      <SimulationPreviewCard
        message=""
        preview={{
          taskTitle: "교통 정책",
          modelType: "claude-sonnet-4-6",
          personaCount: 20,
          estimatedKrw: 4_904,
          holdKrw: 5_885,
          estimatedSeconds: 334,
          sampleCount: 21,
          evidenceSource: "rolling_provider_cost",
          policyFingerprint: "a".repeat(64),
        }}
        wallet={{
          balanceKrw: 1_000_000,
          heldKrw: 10_000,
          availableKrw: 990_000,
          spentTodayKrw: 0,
          updatedAt: "2026-08-29T00:00:00Z",
        }}
      />,
    );

    expect(html).toContain("예상 과금액");
    expect(html).toContain("보류 예정액");
    expect(html).toContain("예상 시간");
    expect(html).toContain("사용 가능액");
    expect(html).not.toContain("비용 근거");
    expect(html).not.toContain("완료 표본");
  });
});

describe("initialRunSetup", () => {
  const options = {
    defaultModel: "anthropic/claude-sonnet-4.6",
    models: ["anthropic/claude-sonnet-4.6"],
    minPersonaCount: 100,
    maxPersonaCount: 800,
    filters: {
      genders: ["남성", "여성"],
      ageGroups: ["10대 이하", "10대", "20대"],
      regions: ["전라남도", "광주광역시"],
      politicalIdeologies: ["중도"],
    },
  };

  it("직전 실행이 없으면 최소 인원과 지역 기본값으로 시작한다", () => {
    expect(initialRunSetup(options, null, null)).toEqual({
      personaCount: 100,
      filters: { regions: ["전라남도", "광주광역시"] },
    });
  });

  it("다시 실행할 때 직전 실행의 인원과 연령 조건(10대 이하 제외)을 이어받는다", () => {
    expect(
      initialRunSetup(options, null, {
        personaCount: 796,
        filters: { age_groups: ["10대", "20대"], genders: ["남성", "여성"] },
      }),
    ).toEqual({
      personaCount: 796,
      filters: {
        regions: ["전라남도", "광주광역시"],
        age_groups: ["10대", "20대"],
        genders: ["남성", "여성"],
      },
    });
  });

  it("주소에 지정한 인원이 우선이고, 범위를 벗어난 값과 없는 선택지는 버린다", () => {
    expect(
      initialRunSetup(options, 300, {
        personaCount: 900,
        filters: { age_groups: ["사라진 값"], regions: ["서울"] },
      }),
    ).toEqual({ personaCount: 300, filters: { regions: ["전라남도", "광주광역시"] } });
    expect(initialRunSetup(options, null, { personaCount: 900, filters: {} }).personaCount).toBe(
      100,
    );
  });
});

describe("loadLatestRunSettings", () => {
  // deploy/nginx/next-webview.conf가 시뮬레이션 서버로 보내는 경로여야 한다.
  const SIMULATION_INGRESS =
    /^\/api\/v1\/admin\/(simulations(?:\/.*)?|simulation-options|simulation-capacity|simulation-tasks(?:\/.*)?|simulation-scenarios(?:\/.*)?|simulation-billing(?:\/.*)?)$/;

  it("시뮬레이션 서버로 라우팅되는 경로에서 직전 실행 설정을 읽는다", async () => {
    const calls: string[] = [];
    const request = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response(JSON.stringify({ personaCount: 796, filters: { age_groups: ["20대"] } }));
    }) as typeof fetch;
    await expect(loadLatestRunSettings("task-1", request)).resolves.toEqual({
      personaCount: 796,
      filters: { age_groups: ["20대"] },
    });
    expect(calls).toEqual(["/api/v1/admin/simulation-tasks/task-1/run-settings"]);
    expect(SIMULATION_INGRESS.test(calls[0] ?? "")).toBe(true);
  });

  it("서버가 이 API를 모르거나 이전 실행이 없으면 null", async () => {
    const notFound = (async () => new Response("{}", { status: 404 })) as typeof fetch;
    const empty = (async () => new Response("null")) as typeof fetch;
    await expect(loadLatestRunSettings("task-1", notFound)).resolves.toBeNull();
    await expect(loadLatestRunSettings("task-1", empty)).resolves.toBeNull();
  });
});
