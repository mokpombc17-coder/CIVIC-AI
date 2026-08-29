import { describe, expect, it } from "vitest";
import {
  isPersonaCountWithinLimit,
  readSimulationCapacity,
  readSimulationOptions,
  readSimulationResult,
  readSimulationResultDetail,
  readSimulationTaskSummaries,
  readSimulationView,
  simulationTargetHref,
  simulationTargetPresentation,
  type SimulationView,
} from "./simulation-contracts";

const simulationId = "7e85d865-4616-4cf5-967c-7d23c27dbf4c";
const taskId = "eb6b5f2b-4969-4e6e-a3e2-d6826620b837";
const fixtureTaskId = "13000000-0000-0000-0000-000000000001";
const fixtureQuestionId = "13010000-0000-0000-0000-000000000001";
const fixtureOptionIds = [
  "13020001-0000-0000-0000-000000000001",
  "13020001-0000-0000-0000-000000000002",
] as const;

describe("simulation contracts", () => {
  it("reads the latest simulation alongside each Vote task", () => {
    const tasks = readSimulationTaskSummaries([
      {
        taskId,
        title: "교통 정책 과업",
        status: "OPEN",
        schedule: null,
        publishedAt: "2026-08-29T00:00:00Z",
        openedAt: "2026-08-29T00:00:00Z",
        closedAt: null,
        closureType: null,
        createdAt: "2026-08-29T00:00:00Z",
        updatedAt: "2026-08-29T00:10:00Z",
        latestSimulation: simulationView({ state: "RUNNING", progressPercent: 26 }),
      },
    ]);

    expect(tasks?.[0]?.latestSimulation?.state).toBe("RUNNING");
    expect(tasks?.[0]?.latestSimulation?.progressPercent).toBe(26);
  });

  it.each([
    [null, "준비됨", "설정하기", "setup", "ready"],
    ["READY", "진행 중", "진행 보기", "status", "running"],
    ["RUNNING", "진행 중", "진행 보기", "status", "running"],
    ["WAITING_PROVIDER", "진행 중", "진행 보기", "status", "running"],
    ["PUBLISHING", "진행 중", "진행 보기", "status", "running"],
    ["COMPLETED", "완료", "결과 보기", "results", "completed"],
    ["FAILED", "확인 필요", "상태 확인", "status", "attention"],
    ["REVIEW_REQUIRED", "확인 필요", "상태 확인", "status", "attention"],
    ["CANCELLED", "확인 필요", "상태 확인", "status", "attention"],
  ] as const)(
    "maps latest state %s to the task-list destination",
    (state, label, action, target, tone) => {
      expect(simulationTargetPresentation(state)).toEqual({ label, action, target, tone });
    },
  );

  it("routes ready, running, and completed tasks to setup, status, and results", () => {
    expect(simulationTargetHref(taskId, null)).toBe(`/admin/simulations/setup?taskId=${taskId}`);
    expect(simulationTargetHref(taskId, { simulationId, state: "RUNNING" })).toBe(
      `/admin/simulations/status?simulationId=${simulationId}`,
    );
    expect(simulationTargetHref(taskId, { simulationId, state: "COMPLETED" })).toBe(
      `/admin/simulations/results?simulationId=${simulationId}`,
    );
  });

  it("accepts the aggregate Task simulation status", () => {
    expect(
      readSimulationView({
        simulationId,
        taskId,
        state: "RUNNING",
        personaCount: 30,
        progressPercent: 50,
        cancelRequested: false,
        errorCode: null,
        resumeAt: null,
        retryAvailableAt: null,
        waitReason: null,
        createdAt: "2026-08-26T00:00:00Z",
        startedAt: "2026-08-26T00:00:01Z",
        completedAt: null,
        deadlineAt: "2026-08-26T00:30:00Z",
        estimatedCompletionAt: "2026-08-26T00:12:00Z",
        canCancel: false,
        estimatedKrw: 2700,
        holdKrw: 3240,
        settledKrw: null,
        absorbedKrw: null,
        billingState: "HELD",
      }),
    ).not.toBeNull();
  });

  it("accepts canonical Vote fixture identifiers in a simulation status", () => {
    expect(
      readSimulationView({
        simulationId,
        taskId: fixtureTaskId,
        state: "READY",
        personaCount: 100,
        progressPercent: 0,
        cancelRequested: false,
        errorCode: null,
        resumeAt: null,
        retryAvailableAt: null,
        waitReason: null,
        createdAt: "2026-08-28T08:16:36Z",
        startedAt: null,
        completedAt: null,
        deadlineAt: "2026-08-28T08:46:36Z",
        estimatedCompletionAt: "2026-08-28T08:22:10Z",
        canCancel: true,
        estimatedKrw: 12348,
        holdKrw: 14818,
        settledKrw: null,
        absorbedKrw: null,
        billingState: "HELD",
      }),
    ).not.toBeNull();
  });

  it("accepts a durable provider-wait status", () => {
    expect(
      readSimulationView({
        simulationId,
        taskId,
        state: "WAITING_PROVIDER",
        personaCount: 10,
        progressPercent: 3,
        cancelRequested: false,
        errorCode: null,
        resumeAt: "2026-08-26T00:01:00Z",
        retryAvailableAt: null,
        waitReason: "calibration_answer_fit_provider_wait",
        createdAt: "2026-08-26T00:00:00Z",
        startedAt: "2026-08-26T00:00:01Z",
        completedAt: null,
        deadlineAt: "2026-08-26T00:30:00Z",
        estimatedCompletionAt: "2026-08-26T00:12:00Z",
        canCancel: false,
      }),
    ).not.toBeNull();
  });

  it.each([
    ["FAILED_PROVIDER", "CALIBRATION_ATTEMPTS_EXHAUSTED"],
    ["REVIEW_REQUIRED", "FINAL_RESPONSE_SLOTS_INCOMPLETE"],
    ["PUBLISHING", null],
    ["REJECTED_PROVIDER_POLICY", "PROVIDER_POLICY_REFUSAL"],
  ])("accepts the V2 terminal state %s", (state, errorCode) => {
    expect(
      readSimulationView({
        simulationId,
        taskId,
        state,
        personaCount: 10,
        progressPercent: 20,
        cancelRequested: false,
        errorCode,
        resumeAt: null,
        retryAvailableAt: state === "REVIEW_REQUIRED" ? "2026-08-27T00:00:20Z" : null,
        waitReason: null,
        createdAt: "2026-08-27T00:00:00Z",
        startedAt: "2026-08-27T00:00:01Z",
        completedAt: "2026-08-27T00:00:10Z",
        deadlineAt: "2026-08-27T00:30:00Z",
        estimatedCompletionAt: null,
        canCancel: false,
        billingState: "RELEASED",
      }),
    ).not.toBeNull();
  });

  it("rejects an individual Persona payload at the simulation result boundary", () => {
    expect(readSimulationResult({ personaId: "user-persona", prediction: "A" })).toBeNull();
  });

  it("accepts the privacy-safe V2 aggregate result view from Simulation", () => {
    const result = readSimulationResult({
      schemaVersion: "CIVIC_TASK_SIMULATION_RESULT_VIEW_V2",
      notice: "이 결과는 생성형 AI를 사용해 생성한 가상 패널 시뮬레이션 결과입니다.",
      task: {
        id: fixtureTaskId,
        title: "AI 투명성 의무",
        description: null,
        status: "DRAFT",
        question: {
          id: fixtureQuestionId,
          content: "의무 강화에 동의하십니까?",
          description: null,
          options: [
            {
              id: fixtureOptionIds[0],
              displayOrder: 1,
              content: "동의한다",
            },
            {
              id: fixtureOptionIds[1],
              displayOrder: 2,
              content: "동의하지 않는다",
            },
          ],
        },
      },
      run: {
        personaCount: 10,
        modelType: "claude-sonnet-4-6",
        filters: { genders: [], age_groups: [] },
      },
      denominators: {
        total: 10,
        filtered: 10,
      },
      optionResults: [
        {
          optionId: fixtureOptionIds[0],
          displayOrder: 1,
          content: "동의한다",
          count: 7,
          percentage: 70,
        },
        {
          optionId: fixtureOptionIds[1],
          displayOrder: 2,
          content: "동의하지 않는다",
          count: 3,
          percentage: 30,
        },
      ],
      unansweredCount: 0,
      summary: {
        totalRespondentCount: 10,
        filteredRespondentCount: 10,
        answeredPersonaCount: 10,
        unansweredPersonaCount: 0,
        optionResults: [
          {
            optionId: fixtureOptionIds[0],
            displayOrder: 1,
            content: "동의한다",
            count: 7,
            percentage: 70,
          },
          {
            optionId: fixtureOptionIds[1],
            displayOrder: 2,
            content: "동의하지 않는다",
            count: 3,
            percentage: 30,
          },
        ],
      },
      availableFilters: {
        genders: ["남성", "여성"],
        ageGroups: ["20대", "30대"],
      },
      resultSlots: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    });

    expect(result?.schemaVersion).toBe("CIVIC_TASK_SIMULATION_RESULT_VIEW_V2");
    expect(result?.summary.answeredPersonaCount).toBe(10);
    expect(result?.resultSlots[0]).toBe(1);
  });

  it("reads one anonymous result-slot detail without internal Persona attributes", () => {
    const detail = readSimulationResultDetail({
      schemaVersion: "CIVIC_TASK_SIMULATION_SLOT_DETAIL_V1",
      notice: "이 결과는 생성형 AI를 사용해 생성한 가상 패널 시뮬레이션 결과입니다.",
      resultSlot: 3,
      selectedOptionId: fixtureOptionIds[0],
      reason: "생활 안전을 우선했습니다.",
      demographics: { gender: "여성", ageGroup: "30대" },
    });

    expect(detail?.resultSlot).toBe(3);
    expect(detail?.demographics).toEqual({ gender: "여성", ageGroup: "30대" });
  });

  it("accepts configured bounds and Persona-main의 네 가지 표본 필터", () => {
    expect(
      readSimulationOptions({
        minPersonaCount: 100,
        maxPersonaCount: 1000,
        defaultModel: "anthropic/claude-sonnet-4.6",
        models: ["anthropic/claude-sonnet-4.6"],
        filters: {
          genders: ["여성", "남성"],
          ageGroups: ["20대", "30대"],
          regions: ["서울", "부산"],
          politicalIdeologies: ["진보", "중도", "보수"],
        },
      }),
    ).toEqual({
      minPersonaCount: 100,
      maxPersonaCount: 1000,
      defaultModel: "anthropic/claude-sonnet-4.6",
      models: ["anthropic/claude-sonnet-4.6"],
      filters: {
        genders: ["여성", "남성"],
        ageGroups: ["20대", "30대"],
        regions: ["서울", "부산"],
        politicalIdeologies: ["진보", "중도", "보수"],
      },
    });
    expect(
      readSimulationOptions({
        minPersonaCount: 100,
        maxPersonaCount: 1000,
        defaultModel: "anthropic/claude-sonnet-4.6",
        models: ["anthropic/claude-sonnet-4.6"],
        filters: {
          genders: ["여성"],
          ageGroups: ["20대"],
          regions: ["서울"],
          politicalIdeologies: ["중도"],
          householdIncomes: ["300만원 미만"],
        },
      }),
    ).toBeNull();
  });

  it("accepts capacity evidence with an actionable closed block reason", () => {
    expect(
      readSimulationCapacity({
        minPersonaCount: 100,
        maxPersonaCount: 1000,
        availablePersonaCount: 84,
        requestedPersonaCount: 100,
        canSimulate: false,
        blockReason: "INSUFFICIENT_UNIQUE_CAPACITY",
      }),
    ).toEqual({
      minPersonaCount: 100,
      maxPersonaCount: 1000,
      availablePersonaCount: 84,
      requestedPersonaCount: 100,
      canSimulate: false,
      blockReason: "INSUFFICIENT_UNIQUE_CAPACITY",
    });
  });

  it("rejects a tampered panel count outside both runtime bounds", () => {
    expect(isPersonaCountWithinLimit(100, 100, 1000)).toBe(true);
    expect(isPersonaCountWithinLimit(99, 100, 1000)).toBe(false);
    expect(isPersonaCountWithinLimit(1001, 100, 1000)).toBe(false);
  });
});

function simulationView(overrides: Partial<SimulationView> = {}): SimulationView {
  return { ...baseSimulationView(), ...overrides };
}

function baseSimulationView(): SimulationView {
  return {
    simulationId,
    taskId,
    state: "READY" as const,
    personaCount: 77,
    progressPercent: 0,
    cancelRequested: false,
    errorCode: null,
    resumeAt: null,
    retryAvailableAt: null,
    waitReason: null,
    createdAt: "2026-08-29T00:00:00Z",
    startedAt: null,
    completedAt: null,
    deadlineAt: "2026-08-29T00:30:00Z",
    estimatedCompletionAt: "2026-08-29T00:05:00Z",
    canCancel: true,
    estimatedKrw: 10_000,
    holdKrw: 12_000,
    settledKrw: null,
    absorbedKrw: null,
    billingState: "HELD" as const,
  };
}
