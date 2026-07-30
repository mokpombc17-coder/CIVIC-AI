import { describe, expect, it } from "vitest";
import { ChatApiError } from "./chat-fetch";
import { isRetryableChatCommandError } from "./chat-command-retry";

function createChatApiError(retryable: boolean): ChatApiError {
  return new ChatApiError(503, "Service Unavailable", "http://localhost:8082/api/v1/rooms", {
    type: "urn:hamcheeze:problem:infrastructure-unavailable",
    title: "Chat infrastructure unavailable",
    status: 503,
    detail: "Please retry the command.",
    instance: "/api/v1/rooms",
    code: "INFRASTRUCTURE_UNAVAILABLE",
    replayed: false,
    retryable,
  });
}

describe("isRetryableChatCommandError", () => {
  it("서버가 retryable로 표시한 Command 오류만 재시도한다", () => {
    expect(isRetryableChatCommandError(createChatApiError(true))).toBe(true);
    expect(isRetryableChatCommandError(createChatApiError(false))).toBe(false);
  });

  it("응답을 받지 못한 fetch 네트워크 오류는 재시도할 수 있다", () => {
    expect(isRetryableChatCommandError(new TypeError("Failed to fetch"))).toBe(true);
  });

  it("그 밖의 오류는 같은 Command 재시도 대상으로 보지 않는다", () => {
    expect(isRetryableChatCommandError(new Error("invalid response contract"))).toBe(false);
    expect(isRetryableChatCommandError(null)).toBe(false);
  });
});
