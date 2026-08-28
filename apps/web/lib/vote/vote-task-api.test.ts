import { describe, expect, it } from "vitest";
import { createVoteTaskApi } from "./vote-task-api";
import type { VoteFetch } from "./vote-fetch";

const TASK_ID = "0f6e8c4f-87d0-4f6e-87b7-c3635c3c96b7";
const SUBMISSION_ID = "0dac284a-bf3f-46c0-89b6-f4a318b488be";

describe("VoteTaskApi", () => {
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
          personaGenerationId: "a64feaf8-fcb8-4780-8977-01c9094821ca",
          personaVersionId: "ec85b168-a766-46a6-a64a-60ed76c66dfa",
          predictionId: "7ae32cd0-68d8-458c-afbd-d8c657697479",
          questionId: "05ecfe73-6bee-4e98-8d3d-ed49262958ef",
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
      personaGenerationId: "a64feaf8-fcb8-4780-8977-01c9094821ca",
      personaVersionId: "ec85b168-a766-46a6-a64a-60ed76c66dfa",
      predictionId: "7ae32cd0-68d8-458c-afbd-d8c657697479",
      questionId: "05ecfe73-6bee-4e98-8d3d-ed49262958ef",
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
});
