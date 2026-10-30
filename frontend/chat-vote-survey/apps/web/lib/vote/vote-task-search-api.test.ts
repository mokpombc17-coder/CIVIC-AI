import { describe, expect, it, vi } from "vitest";
import type { VoteFetch } from "./vote-fetch";
import { createVoteTaskSearchApi } from "./vote-task-search-api";

describe("VoteTaskSearchApi", () => {
  it("정규화한 검색어와 opaque cursor로 통합 검색을 요청한다", async () => {
    const request = vi.fn(async () => ({ items: [], nextCursor: null }));
    const signal = new AbortController().signal;
    const api = createVoteTaskSearchApi(request as unknown as VoteFetch);

    await expect(
      api.searchTasks({ query: "  대중 교통  ", cursor: "opaque+/=", size: 30 }, signal),
    ).resolves.toEqual({ items: [], nextCursor: null });

    expect(request).toHaveBeenCalledWith(
      "/me/tasks/search?query=%EB%8C%80%EC%A4%91+%EA%B5%90%ED%86%B5&size=30&cursor=opaque%2B%2F%3D",
      { signal },
    );
  });

  it("첫 페이지에서는 cursor를 생략하고 기본 size 20을 사용한다", async () => {
    const request = vi.fn(async () => ({ items: [], nextCursor: null }));
    const api = createVoteTaskSearchApi(request as unknown as VoteFetch);

    await api.searchTasks({ query: "주차" });

    expect(request).toHaveBeenCalledWith("/me/tasks/search?query=%EC%A3%BC%EC%B0%A8&size=20", {});
  });
});
