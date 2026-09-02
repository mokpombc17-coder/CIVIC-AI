"use client";

import {
  completedTaskPageSchema,
  myTaskResultSchema,
  type CompletedTaskPage,
  type MyTaskResult,
} from "./vote-completed-contracts";
import { voteFetch, type VoteFetch } from "./vote-fetch";

export type CompletedTaskListParams = Readonly<{
  cursor?: string;
  size?: number;
}>;

export type VoteCompletedApi = Readonly<{
  listCompletedTasks(
    params?: CompletedTaskListParams,
    signal?: AbortSignal,
  ): Promise<CompletedTaskPage>;
  getTaskResult(taskId: string, signal?: AbortSignal): Promise<MyTaskResult>;
}>;

export type VoteCompletedApiMode = "unavailable" | "mock" | "ready";

export class VoteCompletedApiUnavailableError extends Error {
  override readonly name = "VoteCompletedApiUnavailableError";
}

export function createReadyVoteCompletedApi(request: VoteFetch = voteFetch): VoteCompletedApi {
  return {
    async listCompletedTasks({ cursor, size = 20 } = {}, signal) {
      if (!Number.isSafeInteger(size) || size < 1 || size > 100) {
        throw new RangeError("완료 Task 페이지 size는 1 이상 100 이하여야 합니다.");
      }
      const query = new URLSearchParams({ size: String(size) });
      if (cursor) query.set("cursor", cursor);
      return completedTaskPageSchema.parse(
        await request(`/me/tasks/completed?${query}`, signal ? { signal } : {}),
      );
    },
    async getTaskResult(taskId, signal) {
      return myTaskResultSchema.parse(
        await request(`/me/tasks/${taskId}/result`, signal ? { signal } : {}),
      );
    },
  };
}

export function getVoteCompletedApiMode(): VoteCompletedApiMode {
  const mode = process.env.NEXT_PUBLIC_VOTE_COMPLETED_API_MODE;
  if (mode === "mock" || mode === "ready") return mode;
  return "unavailable";
}

export function createVoteCompletedApi(mode = getVoteCompletedApiMode()): VoteCompletedApi {
  if (mode === "ready") return createReadyVoteCompletedApi();
  if (mode === "mock") return createMockVoteCompletedApi();
  return createUnavailableVoteCompletedApi();
}

function createUnavailableVoteCompletedApi(): VoteCompletedApi {
  const rejectUnavailable = () =>
    Promise.reject(
      new VoteCompletedApiUnavailableError("완료 Task 목록과 결과 API는 아직 제공되지 않습니다."),
    );

  return {
    listCompletedTasks: rejectUnavailable,
    getTaskResult: rejectUnavailable,
  };
}

const TASK_A = "0f6e8c4f-87d0-4f6e-87b7-c3635c3c96b7";
const TASK_B = "727c24f5-7c05-4730-912c-5bb6327c6590";
const QUESTION_A = "05ecfe73-6bee-4e98-8d3d-ed49262958ef";
const OPTION_A = "fd04e385-15f2-42b9-b8b1-c0b16b6ee5db";
const OPTION_B = "8de15db2-4093-4386-82a7-c1668f109c2f";
const SUBMISSION_A = "0dac284a-bf3f-46c0-89b6-f4a318b488be";

export const completedTaskFixtures = completedTaskPageSchema.parse({
  items: [
    {
      taskId: TASK_A,
      title: "주말 교통 정책 선호",
      description: "더 나은 이동 환경을 위한 정책 우선순위를 함께 정해요.",
      openedAt: "2026-08-27T00:00:00Z",
      closedAt: "2026-08-30T00:00:00Z",
      closureType: "DEADLINE_REACHED",
      mySubmission: { submissionId: SUBMISSION_A, submittedAt: "2026-08-27T04:00:00Z" },
    },
    {
      taskId: TASK_B,
      title: "공원 운영 시간 선호",
      description: "시민 이용 패턴에 맞는 공원 운영 시간을 선택해 주세요.",
      openedAt: "2026-08-20T00:00:00Z",
      closedAt: "2026-08-25T08:00:00Z",
      closureType: "EARLY_CLOSED",
      mySubmission: {
        submissionId: "9f11fbc9-a60a-40cf-ad38-98f6f9e42bf6",
        submittedAt: "2026-08-22T01:30:00Z",
      },
    },
  ],
  nextCursor: null,
});

export const taskResultFixtures: Readonly<Record<string, MyTaskResult>> = Object.freeze({
  [TASK_A]: myTaskResultSchema.parse({
    taskId: TASK_A,
    title: "주말 교통 정책 선호",
    description: "더 나은 이동 환경을 위한 정책 우선순위를 함께 정해요.",
    closedAt: "2026-08-30T00:00:00Z",
    closureType: "DEADLINE_REACHED",
    resultVersion: 1,
    finalizedAt: "2026-08-30T00:00:00Z",
    responseCount: 120,
    question: { id: QUESTION_A, content: "어떤 방안을 선택하시겠습니까?", description: null },
    options: [
      { id: OPTION_A, displayOrder: 1, content: "대중교통 증편", count: 72, selectedByMe: true },
      {
        id: OPTION_B,
        displayOrder: 2,
        content: "혼잡 통행료 도입",
        count: 48,
        selectedByMe: false,
      },
    ],
    mySubmission: {
      submissionId: SUBMISSION_A,
      selectedOptionId: OPTION_A,
      reasonSource: "AI_ACCEPTED",
      finalReason: "대중교통 공급 확대가 접근성을 높일 것으로 봅니다.",
      submittedAt: "2026-08-27T04:00:00Z",
    },
  }),
  [TASK_B]: myTaskResultSchema.parse({
    taskId: TASK_B,
    title: "공원 운영 시간 선호",
    description: "시민 이용 패턴에 맞는 공원 운영 시간을 선택해 주세요.",
    closedAt: "2026-08-25T08:00:00Z",
    closureType: "EARLY_CLOSED",
    resultVersion: 1,
    finalizedAt: "2026-08-25T08:02:00Z",
    responseCount: 45,
    question: {
      id: "c6a853e0-ab44-453f-88ee-16514fa724d1",
      content: "공원 운영 시간을 어떻게 조정할까요?",
      description: null,
    },
    options: [
      {
        id: "d646aa2a-f48b-4861-86b8-a82aa67a2b18",
        displayOrder: 1,
        content: "오전 6시부터 오후 10시",
        count: 30,
        selectedByMe: false,
      },
      {
        id: "7186583d-c931-4b9b-b8f1-b5856e362ee0",
        displayOrder: 2,
        content: "오전 5시부터 자정",
        count: 15,
        selectedByMe: true,
      },
    ],
    mySubmission: {
      submissionId: "9f11fbc9-a60a-40cf-ad38-98f6f9e42bf6",
      selectedOptionId: "7186583d-c931-4b9b-b8f1-b5856e362ee0",
      reasonSource: "USER_WRITTEN",
      finalReason: "출퇴근 전후에도 공원을 이용할 수 있으면 좋겠습니다.",
      submittedAt: "2026-08-22T01:30:00Z",
    },
  }),
});

export function createMockVoteCompletedApi(delayMs = 120): VoteCompletedApi {
  return {
    async listCompletedTasks({ cursor, size = 20 } = {}, signal) {
      await waitForMock(delayMs, signal);
      const offset = cursor ? Number.parseInt(cursor.replace("mock:", ""), 10) : 0;
      const items = completedTaskFixtures.items.slice(offset, offset + size);
      const nextOffset = offset + items.length;
      return completedTaskPageSchema.parse({
        items,
        nextCursor: nextOffset < completedTaskFixtures.items.length ? `mock:${nextOffset}` : null,
      });
    },
    async getTaskResult(taskId, signal) {
      await waitForMock(delayMs, signal);
      const result = taskResultFixtures[taskId];
      if (!result) throw new Error("TASK_RESULT_NOT_FOUND");
      return myTaskResultSchema.parse(result);
    },
  };
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
