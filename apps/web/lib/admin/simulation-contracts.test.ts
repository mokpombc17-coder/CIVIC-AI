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

  it("rejects a tampered manual-panel count above the runtime limit", () => {
    expect(isPersonaCountWithinLimit(10, 10)).toBe(true);
    expect(isPersonaCountWithinLimit(11, 10)).toBe(false);
    expect(isPersonaCountWithinLimit(0, 10)).toBe(false);
  });
});
