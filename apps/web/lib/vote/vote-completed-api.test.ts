import { describe, expect, it } from "vitest";
import { createMockVoteCompletedApi, createVoteCompletedApi } from "./vote-completed-api";

describe("Vote completed API adapters", () => {
  it("Backend READY 전 기본 adapter는 mock 계약을 반환한다", async () => {
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
