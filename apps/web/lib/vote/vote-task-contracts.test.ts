import { describe, expect, it } from "vitest";
import {
  sortPredictedReasons,
  sortTaskOptions,
  submitTaskRequestSchema,
  taskPredictionViewSchema,
} from "./vote-task-contracts";

const IDS = {
  personaGenerationId: "6f219f29-8598-49f0-9b28-cb7be5720258",
  personaVersionId: "a64feaf8-fcb8-4780-8977-01c9094821ca",
  predictionId: "ec85b168-a766-46a6-a64a-60ed76c66dfa",
  questionId: "05ecfe73-6bee-4e98-8d3d-ed49262958ef",
  selectedOptionId: "fd04e385-15f2-42b9-b8b1-c0b16b6ee5db",
  reasonId: "7ae32cd0-68d8-458c-afbd-d8c657697479",
};

describe("Vote Task contracts", () => {
  it("AI_ACCEPTED와 USER_WRITTEN의 금지 필드를 분리한다", () => {
    expect(
      submitTaskRequestSchema.safeParse({
        ...IDS,
        reasonSource: "AI_ACCEPTED",
        acceptedPredictedReasonId: IDS.reasonId,
        reason: null,
      }).success,
    ).toBe(true);
    expect(
      submitTaskRequestSchema.safeParse({
        ...IDS,
        reasonSource: "USER_WRITTEN",
        acceptedPredictedReasonId: IDS.reasonId,
        reason: "직접 작성",
      }).success,
    ).toBe(false);
  });

  it("직접 작성 이유를 trim 후 1~500자로 제한한다", () => {
    expect(
      submitTaskRequestSchema.parse({
        ...IDS,
        predictionId: null,
        reasonSource: "USER_WRITTEN",
        acceptedPredictedReasonId: null,
        reason: "  내 생각  ",
      }).reason,
    ).toBe("내 생각");
    expect(
      submitTaskRequestSchema.safeParse({
        ...IDS,
        predictionId: null,
        reasonSource: "USER_WRITTEN",
        acceptedPredictedReasonId: null,
        reason: "가".repeat(501),
      }).success,
    ).toBe(false);
  });

  it("모든 PredictionView state와 capability boolean을 보존한다", () => {
    const base = {
      taskId: IDS.selectedOptionId,
      personaGenerationId: null,
      personaVersionId: null,
      personaId: null,
      predictionId: null,
      predictionStatus: null,
      predictedReasons: [],
      predictionFeatureEnabled: true,
      waiting: false,
      predictionRequestAllowed: false,
      predictionUnavailableReason: null,
      submissionAllowed: false,
      predictedAnswerAllowed: false,
      aiAcceptanceAllowed: false,
      directAnswerAllowed: false,
      retryable: false,
      allowedReasonSources: [],
      submissionId: null,
      nextRetryAt: null,
      completedAt: null,
      failureCode: null,
    };
    for (const state of [
      "TASK_NOT_FOUND",
      "TASK_UNPUBLISHED",
      "TASK_CLOSED",
      "ALREADY_SUBMITTED",
      "PERSONA_NOT_READY",
      "NOT_REQUESTED",
      "PENDING",
      "PROCESSING",
      "RETRY_WAIT",
      "SUCCEEDED",
      "FAILED",
    ] as const) {
      expect(taskPredictionViewSchema.parse({ ...base, state }).state).toBe(state);
    }
  });

  it("선택지와 예상 이유를 display 순서로 정렬하면서 원본을 변경하지 않는다", () => {
    const values = [{ displayOrder: 2 }, { displayOrder: 1 }];
    expect(sortTaskOptions(values).map((item) => item.displayOrder)).toEqual([1, 2]);
    expect(values.map((item) => item.displayOrder)).toEqual([2, 1]);
    expect(sortPredictedReasons([{ reasonOrder: 3 }, { reasonOrder: 1 }])).toEqual([
      { reasonOrder: 1 },
      { reasonOrder: 3 },
    ]);
  });
});
