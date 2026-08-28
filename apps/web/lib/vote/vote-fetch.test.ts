import { describe, expect, it, vi } from "vitest";
import { createVoteFetch, VoteApiError } from "./vote-fetch";

describe("voteFetch", () => {
  it("cookie 인증과 no-store로 localhost Vote API를 호출한다", async () => {
    const request = vi.fn(
      async () =>
        new Response(JSON.stringify({ taskId: "task-1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    const voteFetch = createVoteFetch({ baseUrl: "http://localhost:8083/api/v1", request });

    await expect(voteFetch("/me/tasks")).resolves.toEqual({ taskId: "task-1" });
    expect(request).toHaveBeenCalledWith(
      new URL("http://localhost:8083/api/v1/me/tasks"),
      expect.objectContaining({ credentials: "include", cache: "no-store" }),
    );
  });

  it("Problem Detail을 VoteApiError로 노출한다", async () => {
    const problem = {
      type: "about:blank",
      title: "Not Found",
      status: 404,
      detail: "missing",
      instance: "/api/v1/me/tasks/id",
      code: "TASK_NOT_FOUND",
      replayed: false,
      retryable: false,
    };
    const voteFetch = createVoteFetch({
      request: async () =>
        new Response(JSON.stringify(problem), {
          status: 404,
          headers: { "Content-Type": "application/problem+json" },
        }),
    });
    const error = await voteFetch("/me/tasks/id").catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(VoteApiError);
    expect(error).toMatchObject({ status: 404, code: "TASK_NOT_FOUND", retryable: false });
  });
});
