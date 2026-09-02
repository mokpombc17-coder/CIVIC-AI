"use client";

import { createVoteTaskApi, type VoteTaskApi } from "./vote-task-api";
import {
  ensurePredictionResponseSchema,
  myTaskSubmissionSchema,
  openTaskListSchema,
  taskPredictionViewSchema,
  taskSubmissionResponseSchema,
  userTaskDetailSchema,
  type MyTaskSubmission,
} from "./vote-task-contracts";

export type VoteTaskApiMode = "mock" | "ready";

export function getVoteTaskApiMode(): VoteTaskApiMode {
  return process.env.NEXT_PUBLIC_VOTE_TASK_API_MODE === "mock" ? "mock" : "ready";
}

export function createVoteTaskApiAdapter(mode = getVoteTaskApiMode()): VoteTaskApi {
  return mode === "mock" ? createMockVoteTaskApi() : createVoteTaskApi();
}

const TASK_ID = "0f6e8c4f-87d0-4f6e-87b7-c3635c3c96b7";
const QUESTION_ID = "05ecfe73-6bee-4e98-8d3d-ed49262958ef";
const OPTION_A = "fd04e385-15f2-42b9-b8b1-c0b16b6ee5db";
const OPTION_B = "8de15db2-4093-4386-82a7-c1668f109c2f";
const PERSONA_GENERATION_ID = "6f219f29-8598-49f0-9b28-cb7be5720258";
const PERSONA_ID = "aa9c3613-f0ed-4565-8917-f8d7fb8c51c9";
const PREDICTION_ID = "ec85b168-a766-46a6-a64a-60ed76c66dfa";
const REASON_A = "7ae32cd0-68d8-458c-afbd-d8c657697479";
const REASON_B = "2e852b49-5ead-45e4-aa3f-4bcc5e2da861";
const SUBMISSION_ID = "0dac284a-bf3f-46c0-89b6-f4a318b488be";

const detailFixture = userTaskDetailSchema.parse({
  task: {
    id: TASK_ID,
    title: "주말 교통 정책 선호",
    description: "더 나은 이동 환경을 위한 정책 우선순위를 함께 정해요.",
    question: {
      id: QUESTION_ID,
      content: "어떤 방안을 선택하시겠습니까?",
      description: null,
      options: [
        { id: OPTION_A, displayOrder: 1, content: "대중교통 증편" },
        { id: OPTION_B, displayOrder: 2, content: "혼잡 통행료 도입" },
      ],
    },
    status: "OPEN",
    schedule: { opensAt: "2026-08-27T00:00:00Z", closesAt: "2026-08-30T00:00:00Z" },
    publishedAt: "2026-08-26T00:00:00Z",
    openedAt: "2026-08-27T00:00:00Z",
    closedAt: null,
    closureType: null,
    createdAt: "2026-08-25T00:00:00Z",
    updatedAt: "2026-08-27T00:00:00Z",
  },
  closesAt: "2026-08-30T00:00:00Z",
  submission: { submitted: false, submissionId: null, submittedAt: null },
});

const predictionFixture = taskPredictionViewSchema.parse({
  taskId: TASK_ID,
  state: "SUCCEEDED",
  personaGenerationId: PERSONA_GENERATION_ID,
  personaId: PERSONA_ID,
  predictionId: PREDICTION_ID,
  predictionStatus: "SUCCEEDED",
  predictedReasons: [
    {
      id: REASON_A,
      optionId: OPTION_A,
      reasonOrder: 1,
      reason: "대중교통 공급 확대가 접근성을 높일 것으로 봅니다.",
    },
    {
      id: REASON_B,
      optionId: OPTION_B,
      reasonOrder: 1,
      reason: "혼잡 시간대 수요를 줄이는 데 더 직접적이라고 생각합니다.",
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
  completedAt: "2026-08-27T03:50:00Z",
  failureCode: null,
});

export function createMockVoteTaskApi(delayMs = 80): VoteTaskApi {
  let submission: MyTaskSubmission | null = null;

  return {
    async getOpenTasks(signal) {
      await waitForMock(delayMs, signal);
      return openTaskListSchema.parse([
        {
          taskId: TASK_ID,
          title: detailFixture.task.title,
          description: detailFixture.task.description,
          openedAt: detailFixture.task.openedAt,
          closesAt: detailFixture.closesAt,
          submission: submission
            ? {
                submitted: true,
                submissionId: submission.submissionId,
                submittedAt: submission.submittedAt,
              }
            : detailFixture.submission,
        },
      ]);
    },
    async getOpenTask(taskId, signal) {
      await waitForMock(delayMs, signal);
      assertFixtureTask(taskId);
      return userTaskDetailSchema.parse({
        ...detailFixture,
        submission: submission
          ? {
              submitted: true,
              submissionId: submission.submissionId,
              submittedAt: submission.submittedAt,
            }
          : detailFixture.submission,
      });
    },
    async getTaskPrediction(taskId, signal) {
      await waitForMock(delayMs, signal);
      assertFixtureTask(taskId);
      return taskPredictionViewSchema.parse(
        submission
          ? {
              ...predictionFixture,
              state: "ALREADY_SUBMITTED",
              submissionAllowed: false,
              aiAcceptanceAllowed: false,
              directAnswerAllowed: false,
              allowedReasonSources: [],
              submissionId: submission.submissionId,
            }
          : predictionFixture,
      );
    },
    async ensureTaskPrediction(taskId, signal) {
      await waitForMock(delayMs, signal);
      assertFixtureTask(taskId);
      return ensurePredictionResponseSchema.parse({
        taskId: TASK_ID,
        predictionId: PREDICTION_ID,
        personaGenerationId: PERSONA_GENERATION_ID,
        personaId: PERSONA_ID,
        status: "SUCCEEDED",
        created: false,
        waiting: false,
        predictedAnswerAllowed: true,
        directAnswerAllowed: true,
        predictedReasons: predictionFixture.predictedReasons,
        nextRetryAt: null,
        completedAt: predictionFixture.completedAt,
        failureCode: null,
      });
    },
    async submitTask(taskId, command, _idempotencyKey, signal) {
      await waitForMock(delayMs, signal);
      assertFixtureTask(taskId);
      const selected = detailFixture.task.question.options.find(
        (option) => option.id === command.selectedOptionId,
      );
      const predicted = predictionFixture.predictedReasons.find(
        (reason) =>
          reason.id === (command.reasonSource === "AI_ACCEPTED" ? command.predictedReasonId : null),
      );
      if (!selected) throw new Error("TASK_SUBMISSION_VALIDATION_FAILED");
      if (command.reasonSource === "AI_ACCEPTED" && !predicted) {
        throw new Error("TASK_PREDICTED_REASON_NOT_FOUND");
      }
      submission = myTaskSubmissionSchema.parse({
        submissionId: SUBMISSION_ID,
        taskId: TASK_ID,
        taskTitle: detailFixture.task.title,
        taskDescription: detailFixture.task.description,
        personaGenerationId: PERSONA_GENERATION_ID,
        predictionId: PREDICTION_ID,
        submittedAt: "2026-08-27T04:00:00Z",
        questionId: QUESTION_ID,
        question: detailFixture.task.question,
        selectedOptionId: command.selectedOptionId,
        reasonSource: command.reasonSource,
        acceptedPredictedReasonId:
          command.reasonSource === "AI_ACCEPTED" ? command.predictedReasonId : null,
        finalReason: command.reasonSource === "AI_ACCEPTED" ? predicted?.reason : command.reason,
      });
      return taskSubmissionResponseSchema.parse({
        code: "TASK_SUBMISSION_CREATED",
        replayed: false,
        taskId: TASK_ID,
        submissionId: SUBMISSION_ID,
        submittedAt: submission.submittedAt,
      });
    },
    async getTaskSubmissionByTask(taskId, signal) {
      await waitForMock(delayMs, signal);
      assertFixtureTask(taskId);
      if (!submission) throw new Error("TASK_SUBMISSION_NOT_FOUND");
      return submission;
    },
    async getTaskSubmission(submissionId, signal) {
      await waitForMock(delayMs, signal);
      if (!submission || submission.submissionId !== submissionId)
        throw new Error("TASK_SUBMISSION_NOT_FOUND");
      return submission;
    },
  };
}

function assertFixtureTask(taskId: string): void {
  if (taskId !== TASK_ID) throw new Error("TASK_NOT_FOUND");
}

async function waitForMock(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw signal.reason;
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, delayMs);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}
