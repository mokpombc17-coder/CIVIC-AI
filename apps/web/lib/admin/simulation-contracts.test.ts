import { describe, expect, it } from "vitest";
import {
  isPersonaCountWithinLimit,
  readSimulationResult,
  readSimulationView,
} from "./simulation-contracts";

const simulationId = "7e85d865-4616-4cf5-967c-7d23c27dbf4c";
const taskId = "eb6b5f2b-4969-4e6e-a3e2-d6826620b837";

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
        waitReason: null,
        createdAt: "2026-08-26T00:00:00Z",
        startedAt: "2026-08-26T00:00:01Z",
        completedAt: null,
        estimatedKrw: 2700,
        holdKrw: 3240,
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
        waitReason: "calibration_answer_fit_provider_wait",
        createdAt: "2026-08-26T00:00:00Z",
        startedAt: "2026-08-26T00:00:01Z",
        completedAt: null,
      }),
    ).not.toBeNull();
  });

  it("rejects an individual Persona payload at the simulation result boundary", () => {
    expect(readSimulationResult({ personaId: "user-persona", prediction: "A" })).toBeNull();
  });

  it("accepts the pricing fingerprint returned by billed simulation results", () => {
    const result = readSimulationResult({
      schemaVersion: "CIVIC_TASK_SIMULATION_RESULT_V1",
      task: {
        id: taskId,
        title: "AI 투명성 의무",
        description: null,
        status: "DRAFT",
        question: {
          id: "4adc6519-8a61-4724-af2a-21979688b2f4",
          content: "의무 강화에 동의하십니까?",
          description: null,
          options: [
            {
              id: "f8f5ca57-c1d3-4a28-949a-c48b6d508b6a",
              displayOrder: 1,
              content: "동의한다",
            },
            {
              id: "04e503a5-7655-4ce8-aa19-364d2e7426be",
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
      respondents: [],
      engine: {
        name: "SONA PersonaSim",
        sourceCommit: "source-commit",
        modelType: "claude-sonnet-4-6",
        elapsedSeconds: 263.585,
        profileSha256: "profile-sha256",
        networkSha256: "network-sha256",
        calibration: {
          pipelineVersion: "CALIBRATED_PERSONA_PIPELINE_V1",
          contractVersion: "PERSONA_CALIBRATION_V1",
          answerDistributionModel: "anthropic/claude-sonnet-5",
          assignmentModel: "openai/gpt-5.6-luna",
          answerDistribution: [["68.0", "32.0"]],
          informationPracticeDistribution: ["22", "58", "20"],
          assignedInformationPracticeCounts: { A: 2, B: 6, C: 2 },
          targetPopulation: "대한민국 성인",
          referenceTime: "2026-08-27",
          personaSetDigest: "sha256:persona-set",
          proxyEligiblePersonaCount: 4,
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
  });

  it("rejects a tampered manual-panel count above the runtime limit", () => {
    expect(isPersonaCountWithinLimit(10, 10)).toBe(true);
    expect(isPersonaCountWithinLimit(11, 10)).toBe(false);
    expect(isPersonaCountWithinLimit(0, 10)).toBe(false);
  });
});
