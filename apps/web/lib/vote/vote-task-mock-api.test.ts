import { describe, expect, it } from "vitest";
import { createMockVoteTaskApi } from "./vote-task-mock-api";

describe("Persona-ready Task mock adapter", () => {
  it("실제 adapter로 fallback하지 않고 prediction과 제출 상태를 같은 계약으로 전이한다", async () => {
    const api = createMockVoteTaskApi(0);
    const [task] = await api.getOpenTasks();
    expect(task).toBeDefined();
    const prediction = await api.getTaskPrediction(task!.taskId);
    expect(prediction).toMatchObject({ state: "SUCCEEDED", submissionAllowed: true });

    await api.submitTask(
      task!.taskId,
      {
        selectedOptionId: "fd04e385-15f2-42b9-b8b1-c0b16b6ee5db",
        reasonSource: "USER_WRITTEN",
        reason: "직접 작성한 이유",
      },
      "6f219f29-8598-49f0-9b28-cb7be5720258",
    );

    await expect(api.getTaskSubmissionByTask(task!.taskId)).resolves.toMatchObject({
      finalReason: "직접 작성한 이유",
    });
    await expect(api.getTaskPrediction(task!.taskId)).resolves.toMatchObject({
      state: "ALREADY_SUBMITTED",
      submissionAllowed: false,
    });
  });
});
