import { describe, expect, it } from "vitest";
import {
  clearPendingTaskSubmission,
  readPendingTaskSubmission,
  savePendingTaskSubmission,
  type PendingTaskSubmission,
} from "./vote-idempotent-submission";

const taskId = "0f6e8c4f-87d0-4f6e-87b7-c3635c3c96b7";

describe("pending Task submission", () => {
  it("idempotency key와 body를 함께 저장하고 복구·삭제한다", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    const pending: PendingTaskSubmission = {
      taskId,
      idempotencyKey: "6f219f29-8598-49f0-9b28-cb7be5720258",
      command: {
        personaGenerationId: "a64feaf8-fcb8-4780-8977-01c9094821ca",
        personaVersionId: "ec85b168-a766-46a6-a64a-60ed76c66dfa",
        predictionId: null,
        questionId: "05ecfe73-6bee-4e98-8d3d-ed49262958ef",
        selectedOptionId: "fd04e385-15f2-42b9-b8b1-c0b16b6ee5db",
        reasonSource: "USER_WRITTEN",
        acceptedPredictedReasonId: null,
        reason: "직접 작성한 이유",
      },
    };
    savePendingTaskSubmission(pending, storage);
    expect(readPendingTaskSubmission(taskId, storage)).toEqual(pending);
    clearPendingTaskSubmission(taskId, storage);
    expect(readPendingTaskSubmission(taskId, storage)).toBeNull();
  });
});
