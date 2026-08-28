import { describe, expect, it } from "vitest";
import {
  isPersonaCountWithinLimit,
  readSimulationCapacity,
  readSimulationOptions,
  readSimulationResult,
  readSimulationView,
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

  it("accepts billed simulation results containing canonical Vote fixture identifiers", () => {
    const result = readSimulationResult({
      schemaVersion: "CIVIC_TASK_SIMULATION_RESULT_V1",
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
        sampleSeed: 20260827,
        filters: {},
        pricingFingerprint: "pricing-policy-sha256",
      },
      summary: {
        requestedPersonaCount: 10,
        answeredPersonaCount: 10,
        unansweredPersonaCount: 0,
        optionResults: [],
      },
      respondents: [
        {
          panelMemberOrdinal: 1,
          selectedOptionId: fixtureOptionIds[0],
          reason: "생활 안전을 우선했습니다.",
          demographics: {
            gender: "여성",
            ageGroup: "30대",
            region: "서울",
            politicalIdeology: "중도",
            informationType: "A",
          },
        },
      ],
      engine: {
        name: "SONA PersonaSim",
        sourceCommit: "source-commit",
        modelType: "claude-sonnet-4-6",
        elapsedSeconds: 263.585,
        profileSha256: "profile-sha256",
        networkSha256: "network-sha256",
        calibration: {
          pipelineVersion: "CALIBRATED_PERSONA_PIPELINE_V2",
          contractVersion: "PERSONA_CALIBRATION_V2",
          answerDistributionModel: "anthropic/claude-sonnet-5",
          assignmentModel: "openai/gpt-5.6-luna",
          answerDistribution: [["68.0", "32.0"]],
          informationPracticeDistribution: ["22", "58", "20"],
          assignedInformationPracticeCounts: { A: 2, B: 6, C: 2 },
          targetPopulation: "대한민국 성인",
          referenceTime: "2026-08-27",
          personaSetDigest: "sha256:persona-set",
          proxyEligiblePersonaCount: 4,
          supplementedPersonaCount: 1,
          providerEvidence: {
            totalProviderCalls: 4,
            validatedProviderCalls: 4,
            callsByStageAndModel: [],
          },
        },
        externalInformation: {
          sourceMode: "text",
          keywordCount: 4,
          collectedDocumentCount: 158,
          documentCountsBySource: { naver: 158 },
          documentCountsByNaverEndpoint: { news: 40, blog: 40, cafearticle: 38, webkr: 40 },
          personaSeenItemCount: 38,
          providerCallCountsByStage: { "llm.generate": 10 },
        },
        personaWorkers: 2,
        innerWorkers: 1,
      },
    });

    expect(result?.run.pricingFingerprint).toBe("pricing-policy-sha256");
    expect(result?.engine.calibration.pipelineVersion).toBe("CALIBRATED_PERSONA_PIPELINE_V2");
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
