import { describe, expect, it } from "vitest";
import { isChatProblemDetails } from "./chat-problem-details";

const baseProblem = {
  type: "urn:hamcheeze:problem:invalid-request",
  title: "Invalid room API request",
  status: 400,
  detail: "The request body is invalid.",
  instance: "/api/v1/rooms",
  code: "INVALID_REQUEST",
  replayed: false,
  retryable: false,
};

describe("isChatProblemDetails", () => {
  it("공통 Problem Details 응답을 판별한다", () => {
    expect(isChatProblemDetails(baseProblem)).toBe(true);
  });

  it("Room command의 clientRequestId를 보존하고 잘못된 타입은 거절한다", () => {
    const problem = {
      ...baseProblem,
      clientRequestId: "07af9111-3e20-43e5-ae80-78d1bf547647",
    };

    expect(isChatProblemDetails(problem)).toBe(true);

    if (!isChatProblemDetails(problem)) {
      throw new Error("Problem Details 계약을 만족해야 합니다.");
    }

    expect(problem.clientRequestId).toBe("07af9111-3e20-43e5-ae80-78d1bf547647");
    expect(isChatProblemDetails({ ...problem, clientRequestId: 123 })).toBe(false);
  });

  it("body validation의 fieldErrors를 판별한다", () => {
    expect(
      isChatProblemDetails({
        ...baseProblem,
        fieldErrors: [
          {
            field: "visibility",
            message: "must not be null",
          },
        ],
      }),
    ).toBe(true);
  });

  it("메시지 검색 rate limit의 positive retryAfterMs를 보존한다", () => {
    const problem = {
      ...baseProblem,
      type: "urn:hamcheeze:problem:message-search-rate-limited",
      title: "Message search failed",
      status: 429,
      detail: "Message search rate limit was exceeded.",
      instance: "/api/v1/rooms/room-1/messages/search",
      code: "MESSAGE_SEARCH_RATE_LIMITED",
      retryable: true,
      retryAfterMs: 250,
    };

    expect(isChatProblemDetails(problem)).toBe(true);

    if (!isChatProblemDetails(problem)) {
      throw new Error("검색 rate limit Problem Details 계약을 만족해야 합니다.");
    }

    expect(problem.retryAfterMs).toBe(250);
  });

  it("메시지 검색 rate limit의 상태와 retryAfterMs invariant를 검증한다", () => {
    const rateLimitProblem = {
      ...baseProblem,
      status: 429,
      code: "MESSAGE_SEARCH_RATE_LIMITED",
      retryable: true,
      retryAfterMs: 250,
    };

    expect(isChatProblemDetails({ ...rateLimitProblem, retryAfterMs: undefined })).toBe(false);
    expect(isChatProblemDetails({ ...rateLimitProblem, retryAfterMs: 0 })).toBe(false);
    expect(isChatProblemDetails({ ...rateLimitProblem, retryAfterMs: 1.5 })).toBe(false);
    expect(isChatProblemDetails({ ...rateLimitProblem, retryable: false })).toBe(false);
    expect(isChatProblemDetails({ ...rateLimitProblem, replayed: true })).toBe(false);
    expect(isChatProblemDetails({ ...rateLimitProblem, status: 503 })).toBe(false);
  });

  it("다른 Problem Details의 retryAfterMs는 optional positive integer로 처리한다", () => {
    expect(isChatProblemDetails(baseProblem)).toBe(true);
    expect(isChatProblemDetails({ ...baseProblem, retryAfterMs: 1 })).toBe(true);
    expect(isChatProblemDetails({ ...baseProblem, retryAfterMs: null })).toBe(false);
  });

  it("필수 필드나 fieldErrors 형태가 잘못되면 거부한다", () => {
    expect(
      isChatProblemDetails({
        ...baseProblem,
        retryable: "false",
      }),
    ).toBe(false);
    expect(
      isChatProblemDetails({
        ...baseProblem,
        fieldErrors: [{ field: "visibility" }],
      }),
    ).toBe(false);
  });
});
