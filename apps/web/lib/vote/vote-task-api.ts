"use client";

import {
  ensurePredictionResponseSchema,
  myTaskSubmissionSchema,
  openTaskListSchema,
  submitTaskRequestSchema,
  taskPredictionViewSchema,
  taskSubmissionResponseSchema,
  userTaskDetailSchema,
  voteTaskIdSchema,
  type EnsurePredictionResponse,
  type MyTaskSubmission,
  type SubmitTaskRequest,
  type TaskPredictionView,
  type TaskSubmissionResponse,
  type UserTaskDetail,
  type UserTaskSummary,
} from "./vote-task-contracts";
import { voteFetch, type VoteFetch } from "./vote-fetch";

export type VoteTaskApi = Readonly<{
  getOpenTasks(signal?: AbortSignal): Promise<UserTaskSummary[]>;
  getOpenTask(taskId: string, signal?: AbortSignal): Promise<UserTaskDetail>;
  getTaskPrediction(taskId: string, signal?: AbortSignal): Promise<TaskPredictionView>;
  ensureTaskPrediction(taskId: string, signal?: AbortSignal): Promise<EnsurePredictionResponse>;
  submitTask(
    taskId: string,
    command: SubmitTaskRequest,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<TaskSubmissionResponse>;
  getTaskSubmissionByTask(taskId: string, signal?: AbortSignal): Promise<MyTaskSubmission>;
  getTaskSubmission(submissionId: string, signal?: AbortSignal): Promise<MyTaskSubmission>;
}>;

export function createVoteTaskApi(request: VoteFetch = voteFetch): VoteTaskApi {
  return {
    async getOpenTasks(signal) {
      return openTaskListSchema.parse(await request("/me/tasks", signal ? { signal } : {}));
    },
    async getOpenTask(taskId, signal) {
      return userTaskDetailSchema.parse(
        await request(`/me/tasks/${parseUuid(taskId)}`, signal ? { signal } : {}),
      );
    },
    async getTaskPrediction(taskId, signal) {
      return taskPredictionViewSchema.parse(
        await request(`/me/tasks/${parseUuid(taskId)}/prediction`, signal ? { signal } : {}),
      );
    },
    async ensureTaskPrediction(taskId, signal) {
      return ensurePredictionResponseSchema.parse(
        await request(`/me/tasks/${parseUuid(taskId)}/prediction`, {
          method: "POST",
          ...(signal ? { signal } : {}),
        }),
      );
    },
    async submitTask(taskId, command, idempotencyKey, signal) {
      const parsedCommand = submitTaskRequestSchema.parse(command);
      const key = parseUuid(idempotencyKey);
      return taskSubmissionResponseSchema.parse(
        await request(`/me/tasks/${parseUuid(taskId)}/submission`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": key,
          },
          body: JSON.stringify(parsedCommand),
          ...(signal ? { signal } : {}),
        }),
      );
    },
    async getTaskSubmissionByTask(taskId, signal) {
      const query = new URLSearchParams({ taskId: parseUuid(taskId) });
      return myTaskSubmissionSchema.parse(
        await request(`/me/submissions?${query}`, signal ? { signal } : {}),
      );
    },
    async getTaskSubmission(submissionId, signal) {
      return myTaskSubmissionSchema.parse(
        await request(`/me/submissions/${parseUuid(submissionId)}`, signal ? { signal } : {}),
      );
    },
  };
}

export const voteTaskApi = createVoteTaskApi();

function parseUuid(value: string): string {
  return voteTaskIdSchema.parse(value);
}
