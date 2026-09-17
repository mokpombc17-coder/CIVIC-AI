import { describe, expect, it } from "vitest";
import {
  clearAllPendingTaskSubmissions,
  clearPendingTaskSubmission,
  getOrCreatePendingTaskSubmission,
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
        selectedOptionId: "fd04e385-15f2-42b9-b8b1-c0b16b6ee5db",
        reasonSource: "USER_WRITTEN",
        reason: "직접 작성한 이유",
      },
    };
    savePendingTaskSubmission(pending, storage);
    expect(readPendingTaskSubmission(taskId, storage)).toEqual(pending);
    clearPendingTaskSubmission(taskId, storage);
    expect(readPendingTaskSubmission(taskId, storage)).toBeNull();
  });

  it("같은 body 재시도에는 key를 재사용하고 수정한 body에는 새 key를 만든다", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const keys = ["first-key", "second-key"];
    const baseCommand = {
      selectedOptionId: "fd04e385-15f2-42b9-b8b1-c0b16b6ee5db",
      reasonSource: "USER_WRITTEN" as const,
      reason: "첫 번째 이유",
    };

    const first = getOrCreatePendingTaskSubmission(taskId, baseCommand, storage, () =>
      keys.shift()!,
    );
    const replay = getOrCreatePendingTaskSubmission(taskId, baseCommand, storage, () =>
      keys.shift()!,
    );
    const edited = getOrCreatePendingTaskSubmission(
      taskId,
      { ...baseCommand, reason: "수정한 이유" },
      storage,
      () => keys.shift()!,
    );

    expect(replay.idempotencyKey).toBe(first.idempotencyKey);
    expect(edited.idempotencyKey).toBe("second-key");
  });

  it("인증 경계에서는 다른 session key를 보존하고 모든 pending 제출만 삭제한다", () => {
    const values = new Map([
      ["civic.analytics-user-id.v1", "analytics-user-id"],
      ["civic-ai:survey-draft:v1:owner:round", "survey-draft"],
      ["civic-ai:vote:pending-task-submission:task-01", "pending-01"],
      ["civic-ai:vote:pending-task-submission:task-02", "pending-02"],
    ]);
    const storage = {
      get length() {
        return values.size;
      },
      key: (index: number) => [...values.keys()][index] ?? null,
      removeItem: (key: string) => values.delete(key),
    };

    clearAllPendingTaskSubmissions(storage);

    expect([...values.entries()]).toEqual([
      ["civic.analytics-user-id.v1", "analytics-user-id"],
      ["civic-ai:survey-draft:v1:owner:round", "survey-draft"],
    ]);
  });
});
