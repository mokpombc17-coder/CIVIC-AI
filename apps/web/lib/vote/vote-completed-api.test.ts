import { describe, expect, it } from "vitest";
import { createMockVoteCompletedApi, createVoteCompletedApi } from "./vote-completed-api";

describe("Vote completed API adapters", () => {
  it("미구현 상태에서는 Backend에 요청하지 않고 명시적인 오류를 반환한다", async () => {
    await expect(createVoteCompletedApi("unavailable").listCompletedTasks()).rejects.toThrow(
      "완료 Task 목록과 결과 API는 아직 제공되지 않습니다.",
    );
  });

  it("mock mode adapter는 디자인 검수용 계약을 반환한다", async () => {
    const page = await createVoteCompletedApi("mock").listCompletedTasks({ size: 1 });
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBe("mock:1");
  });

  it("opaque mock cursor를 그대로 다음 페이지 경계로 사용한다", async () => {
    const api = createMockVoteCompletedApi(0);
    const page = await api.listCompletedTasks({ cursor: "mock:1", size: 1 });
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBeNull();
  });
});
