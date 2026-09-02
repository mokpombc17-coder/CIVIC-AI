import { describe, expect, it } from "vitest";
import {
  openTaskListSchema,
  sortPredictedReasons,
  sortTaskOptions,
  submitTaskRequestSchema,
  taskPredictionViewSchema,
} from "./vote-task-contracts";

const IDS = {
  selectedOptionId: "fd04e385-15f2-42b9-b8b1-c0b16b6ee5db",
  reasonId: "7ae32cd0-68d8-458c-afbd-d8c657697479",
};

describe("Vote Task contracts", () => {
  it("Backend Java UUID가 사용하는 canonical 문자열을 version과 무관하게 수용한다", () => {
    expect(
      openTaskListSchema.safeParse([
        {
          taskId: "13000000-0000-0000-0000-000000000001",
          title: "과업",
          description: null,
          openedAt: "2026-08-27T00:00:00Z",
          closesAt: "2026-08-30T00:00:00Z",
          submission: { submitted: false, submissionId: null, submittedAt: null },
        },
      ]).success,
    ).toBe(true);
  });

  it("과업 제출 여부와 제출 식별자 null 조합을 일치시킨다", () => {
    const base = {
      taskId: IDS.selectedOptionId,
      title: "과업",
      description: null,
      openedAt: "2026-08-27T00:00:00Z",
      closesAt: "2026-08-30T00:00:00Z",
    };

    expect(
      openTaskListSchema.safeParse([
        {
          ...base,
          submission: { submitted: false, submissionId: null, submittedAt: null },
        },
      ]).success,
    ).toBe(true);
    expect(
      openTaskListSchema.safeParse([
        {
          ...base,
          submission: {
            submitted: true,
            submissionId: null,
            submittedAt: "2026-08-28T03:00:00Z",
          },
        },
      ]).success,
    ).toBe(false);
    expect(
      openTaskListSchema.safeParse([
        {
          ...base,
          submission: {
            submitted: false,
            submissionId: IDS.reasonId,
            submittedAt: "2026-08-28T03:00:00Z",
          },
        },
      ]).success,
    ).toBe(false);
  });

  it("AI_ACCEPTED와 USER_WRITTEN을 Backend가 결정하지 않는 최소 필드로 제한한다", () => {
    expect(
      submitTaskRequestSchema.safeParse({
        ...IDS,
        reasonSource: "AI_ACCEPTED",
        predictedReasonId: IDS.reasonId,
      }).success,
    ).toBe(true);
    expect(
      submitTaskRequestSchema.safeParse({
        ...IDS,
        reasonSource: "USER_WRITTEN",
        predictedReasonId: IDS.reasonId,
        reason: "직접 작성",
      }).data,
    ).toEqual({
      selectedOptionId: IDS.selectedOptionId,
      reasonSource: "USER_WRITTEN",
      reason: "직접 작성",
    });
  });

  it("직접 작성은 Prediction identity 없이 이유를 Unicode 1~500자로 제한한다", () => {
    expect(
      submitTaskRequestSchema.parse({
        ...IDS,
        reasonSource: "USER_WRITTEN",
        reason: "  내 생각  ",
      }),
    ).toEqual({
      selectedOptionId: IDS.selectedOptionId,
      reasonSource: "USER_WRITTEN",
      reason: "내 생각",
    });
    expect(
      submitTaskRequestSchema.safeParse({
        ...IDS,
        reasonSource: "USER_WRITTEN",
        reason: "가".repeat(501),
      }).success,
    ).toBe(false);
    expect(
      submitTaskRequestSchema.safeParse({
        ...IDS,
        reasonSource: "USER_WRITTEN",
        reason: "😀".repeat(500),
      }).success,
    ).toBe(true);
  });

  it("모든 PredictionView state와 capability boolean을 보존한다", () => {
    const base = {
      taskId: IDS.selectedOptionId,
      personaGenerationId: null,
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
