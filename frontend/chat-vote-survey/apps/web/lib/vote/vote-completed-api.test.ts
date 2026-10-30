import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMockVoteCompletedApi,
  createReadyVoteCompletedApi,
  createVoteCompletedApi,
  getVoteCompletedApiMode,
  taskResultFixtures,
} from "./vote-completed-api";
import type { VoteFetch } from "./vote-fetch";

const ORIGINAL_COMPLETED_API_MODE = process.env.NEXT_PUBLIC_VOTE_COMPLETED_API_MODE;

afterEach(() => {
  if (ORIGINAL_COMPLETED_API_MODE === undefined) {
    delete process.env.NEXT_PUBLIC_VOTE_COMPLETED_API_MODE;
    return;
  }
  process.env.NEXT_PUBLIC_VOTE_COMPLETED_API_MODE = ORIGINAL_COMPLETED_API_MODE;
});

describe("getVoteCompletedApiMode", () => {
  it("환경값이 없으면 실제 완료 API를 사용하는 ready가 기본값이다", () => {
    delete process.env.NEXT_PUBLIC_VOTE_COMPLETED_API_MODE;

    expect(getVoteCompletedApiMode()).toBe("ready");
  });

  it.each(["unavailable", "mock", "ready"] as const)(
    "%s mode를 명시하면 해당 설정을 사용한다",
    (mode) => {
      process.env.NEXT_PUBLIC_VOTE_COMPLETED_API_MODE = mode;

      expect(getVoteCompletedApiMode()).toBe(mode);
    },
  );
});

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

  it("사용자 결과 응답의 opinionMap을 파싱한다", async () => {
    const fixture = Object.values(taskResultFixtures)[0]!;
    const requestMock = vi.fn(async () => fixture);

    const result = await createReadyVoteCompletedApi(
      requestMock as unknown as VoteFetch,
    ).getTaskResult(fixture.taskId);

    expect(requestMock).toHaveBeenCalledWith(`/me/tasks/${fixture.taskId}/result`, {});
    expect(result.opinionMap).toEqual(fixture.opinionMap);
  });

  it("opaque mock cursor를 그대로 다음 페이지 경계로 사용한다", async () => {
    const api = createMockVoteCompletedApi(0);
    const page = await api.listCompletedTasks({ cursor: "mock:1", size: 1 });
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBeNull();
  });
});
