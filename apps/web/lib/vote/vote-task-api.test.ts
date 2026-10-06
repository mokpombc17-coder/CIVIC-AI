import { describe, expect, it } from "vitest";
import { createVoteTaskApi } from "./vote-task-api";
import type { VoteFetch } from "./vote-fetch";

const TASK_ID = "0f6e8c4f-87d0-4f6e-87b7-c3635c3c96b7";
const SUBMISSION_ID = "0dac284a-bf3f-46c0-89b6-f4a318b488be";

describe("VoteTaskApi", () => {
  it("진행 중 목록의 204 No Content를 빈 목록으로 변환한다", async () => {
    const request: VoteFetch = async <TResponse>() => undefined as TResponse;

    await expect(createVoteTaskApi(request).getOpenTasks()).resolves.toEqual([]);
  });

  it("Task 제출에 caller의 UUID key와 검증된 body를 사용한다", async () => {
    const calls: Array<{ path: string; init?: RequestInit }> = [];
    const request: VoteFetch = async <TResponse>(path: string, init?: RequestInit) => {
      calls.push({ path, ...(init ? { init } : {}) });
      return {
        code: "TASK_SUBMISSION_CREATED",
        replayed: true,
        taskId: TASK_ID,
        submissionId: SUBMISSION_ID,
        submittedAt: "2026-08-27T04:00:00Z",
      } as TResponse;
    };
    const api = createVoteTaskApi(request);
    const key = "6f219f29-8598-49f0-9b28-cb7be5720258";

    await expect(
      api.submitTask(
        TASK_ID,
        {
          selectedOptionId: "fd04e385-15f2-42b9-b8b1-c0b16b6ee5db",
          reasonSource: "USER_WRITTEN",
          reason: "  직접 작성  ",
        },
        key,
      ),
    ).resolves.toMatchObject({ replayed: true });

    expect(calls[0]?.path).toBe(`/me/tasks/${TASK_ID}/submission`);
    expect(new Headers(calls[0]?.init?.headers).get("Idempotency-Key")).toBe(key);
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      selectedOptionId: "fd04e385-15f2-42b9-b8b1-c0b16b6ee5db",
      reasonSource: "USER_WRITTEN",
      reason: "직접 작성",
    });
  });

  it("유효하지 않은 Task ID는 HTTP 요청 전에 거절한다", async () => {
    let called = false;
    const request: VoteFetch = async <TResponse>() => {
      called = true;
      return undefined as TResponse;
    };
    await expect(createVoteTaskApi(request).getOpenTask("not-a-uuid")).rejects.toThrow();
    expect(called).toBe(false);
  });

  it("personaVersionId가 없는 현재 내 제출 응답 계약을 파싱한다", async () => {
    const request: VoteFetch = async <TResponse>() =>
      ({
        submissionId: SUBMISSION_ID,
        taskId: TASK_ID,
        taskTitle: "우리 동네 생활 개선 과업",
        taskDescription: "단일 선택 투표입니다.",
        personaGenerationId: "469da61a-7d39-46dc-a17b-6c045880d161",
        predictionId: null,
        submittedAt: "2026-09-01T07:41:58.870110Z",
        questionId: "13010000-0000-0000-0000-000000000001",
        question: {
          id: "13010000-0000-0000-0000-000000000001",
          content: "가장 먼저 개선할 분야는 무엇인가요?",
          description: null,
          options: [
            {
              id: "13020001-0000-0000-0000-000000000001",
              displayOrder: 1,
              content: "교통",
            },
          ],
        },
        selectedOptionId: "13020001-0000-0000-0000-000000000001",
        reasonSource: "USER_WRITTEN",
        acceptedPredictedReasonId: null,
        finalReason: "교통 불편을 먼저 개선하고 싶습니다.",
      }) as TResponse;

    await expect(
      createVoteTaskApi(request).getTaskSubmission(SUBMISSION_ID),
    ).resolves.toMatchObject({
      submissionId: SUBMISSION_ID,
      predictionId: null,
      reasonSource: "USER_WRITTEN",
    });
  });
});
