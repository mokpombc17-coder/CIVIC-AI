import { describe, expect, it } from "vitest";
import {
  readSimulationResult,
  readSimulationTaskDetail,
  readSimulationTaskSummaries,
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

  it("accepts simulation-only task snapshots without lifecycle audit", () => {
    const task = {
      id: taskId,
      title: "AI 정책",
      description: null,
      status: "DRAFT",
      schedule: null,
      publishedAt: null,
      openedAt: null,
      closedAt: null,
      closureType: null,
      createdAt: "2026-08-26T00:00:00Z",
      updatedAt: "2026-08-26T00:00:00Z",
      question: {
        id: simulationId,
        content: "동의합니까?",
        description: null,
        options: [
          { id: taskId, displayOrder: 1, content: "동의" },
          { id: simulationId, displayOrder: 2, content: "비동의" },
        ],
      },
    };
    expect(readSimulationTaskDetail({ task })).toEqual({ task, lifecycleHistory: [] });
    expect(
      readSimulationTaskSummaries([
        {
          taskId,
          title: "AI 정책",
          status: "DRAFT",
          schedule: null,
          publishedAt: null,
          openedAt: null,
          closedAt: null,
          closureType: null,
          createdAt: "2026-08-26T00:00:00Z",
          updatedAt: "2026-08-26T00:00:00Z",
        },
      ]),
    ).not.toBeNull();
  });
});
