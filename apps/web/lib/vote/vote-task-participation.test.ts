import { describe, expect, it } from "vitest";
import {
  canStartTaskResponse,
  createTaskSubmissionCommand,
  getPredictedReasonsForOption,
} from "./vote-task-participation";
import type { TaskPredictionView } from "./vote-task-contracts";

const IDS = {
  taskId: "13000000-0000-0000-0000-000000000003",
  personaGenerationId: "6f219f29-8598-49f0-9b28-cb7be5720258",
  personaVersionId: "a64feaf8-fcb8-4780-8977-01c9094821ca",
  personaId: "aa9c3613-f0ed-4565-8917-f8d7fb8c51c9",
  predictionId: "ec85b168-a766-46a6-a64a-60ed76c66dfa",
  questionId: "13010002-0000-0000-0000-000000000001",
  optionA: "13020002-0000-0000-0000-000000000001",
  optionB: "13020002-0000-0000-0000-000000000002",
  reasonA1: "880aa8b0-e2e9-30ac-9150-4bf13b85fe7f",
  reasonA2: "93127021-6ee2-3803-b934-dc133317da78",
};

const view: TaskPredictionView = {
  taskId: IDS.taskId,
  state: "SUCCEEDED",
  personaGenerationId: IDS.personaGenerationId,
  personaVersionId: IDS.personaVersionId,
  personaId: IDS.personaId,
  predictionId: IDS.predictionId,
  predictionStatus: "SUCCEEDED",
  predictedReasons: [
    { id: IDS.reasonA2, optionId: IDS.optionA, reasonOrder: 2, reason: "예상 이유 2" },
    { id: IDS.reasonA1, optionId: IDS.optionA, reasonOrder: 1, reason: "예상 이유 1" },
    {
      id: "a83e9845-1601-3cc3-bde0-32ab8ce34cad",
      optionId: IDS.optionB,
      reasonOrder: 1,
      reason: "다른 선택지 이유",
    },
  ],
  predictionFeatureEnabled: true,
  waiting: false,
  predictionRequestAllowed: false,
  predictionUnavailableReason: null,
  submissionAllowed: true,
  predictedAnswerAllowed: true,
  aiAcceptanceAllowed: true,
  directAnswerAllowed: true,
  retryable: false,
  allowedReasonSources: ["AI_ACCEPTED", "USER_WRITTEN"],
  submissionId: null,
  nextRetryAt: null,
  completedAt: "2026-08-28T00:00:00Z",
  failureCode: null,
};

describe("Vote Task participation", () => {
  it("선택한 option의 예상 이유만 reasonOrder 순서로 제공한다", () => {
    expect(getPredictedReasonsForOption(view, IDS.optionA).map((reason) => reason.id)).toEqual([
      IDS.reasonA1,
      IDS.reasonA2,
    ]);
  });

  it("AI 이유 채택 command는 reason 문자열 없이 reason ID를 사용한다", () => {
    expect(
      createTaskSubmissionCommand({
        view,
        questionId: IDS.questionId,
        selectedOptionId: IDS.optionA,
        selection: { kind: "AI_ACCEPTED", predictedReasonId: IDS.reasonA1 },
      }),
    ).toEqual({
      personaGenerationId: IDS.personaGenerationId,
      personaVersionId: IDS.personaVersionId,
      predictionId: IDS.predictionId,
      questionId: IDS.questionId,
      selectedOptionId: IDS.optionA,
      reasonSource: "AI_ACCEPTED",
      acceptedPredictedReasonId: IDS.reasonA1,
      reason: null,
    });
  });

  it("직접 작성 command는 accepted reason ID를 포함하지 않는다", () => {
    expect(
      createTaskSubmissionCommand({
        view,
        questionId: IDS.questionId,
        selectedOptionId: IDS.optionA,
        selection: { kind: "USER_WRITTEN", reason: "  직접 작성한 이유  " },
      }),
    ).toEqual({
      personaGenerationId: IDS.personaGenerationId,
      personaVersionId: IDS.personaVersionId,
      predictionId: IDS.predictionId,
      questionId: IDS.questionId,
      selectedOptionId: IDS.optionA,
      reasonSource: "USER_WRITTEN",
      reason: "직접 작성한 이유",
    });
  });

  it("Prediction identity와 허용 source가 준비된 경우에만 응답 작성을 시작한다", () => {
    expect(canStartTaskResponse(view)).toBe(true);
    expect(canStartTaskResponse({ ...view, predictionId: null })).toBe(false);
    expect(
      canStartTaskResponse({
        ...view,
        aiAcceptanceAllowed: false,
        directAnswerAllowed: false,
        allowedReasonSources: [],
      }),
    ).toBe(false);
  });
});
