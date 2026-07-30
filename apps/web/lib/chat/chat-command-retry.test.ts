import { describe, expect, it } from "vitest";
import { ChatApiError } from "./chat-fetch";
import { isRetryableChatCommandError, selectRetryableChatCommand } from "./chat-command-retry";
import { createIdempotentCommand } from "./idempotent-command";

function createChatApiError(retryable: boolean, code = "INFRASTRUCTURE_UNAVAILABLE"): ChatApiError {
  return new ChatApiError(503, "Service Unavailable", "http://localhost:8082/api/v1/rooms", {
    type: "urn:hamcheeze:problem:infrastructure-unavailable",
    title: "Chat infrastructure unavailable",
    status: 503,
    detail: "Please retry the command.",
    instance: "/api/v1/rooms",
    code,
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

  it("ACCESS_REVOCATION_FAILED 재시도는 최초 Command와 Idempotency-Key를 보존한다", () => {
    const idempotencyKey = "07af9111-3e20-43e5-ae80-78d1bf547647";
    const failedCommand = {
      kind: "leave" as const,
      command: createIdempotentCommand(undefined, () => idempotencyKey),
    };

    const retryCommand = selectRetryableChatCommand(
      failedCommand,
      createChatApiError(true, "ACCESS_REVOCATION_FAILED"),
    );

    expect(retryCommand).toBe(failedCommand);
    expect(retryCommand?.command).toBe(failedCommand.command);
    expect(retryCommand?.command.idempotencyKey).toBe(idempotencyKey);
  });
});
