import { describe, expect, it } from "vitest";
import { ChatApiError } from "./chat-fetch";
import {
  createRoomMessageContextErrorPresentation,
  createRoomMessageSearchErrorPresentation,
} from "./chat-room-message-search-error-presentation";

describe("Room message search error presentation", () => {
  it.each([
    ["INVALID_REQUEST", false, false],
    ["INVALID_CURSOR", false, false],
    ["ACCESS_DENIED", false, true],
    ["MESSAGE_SEARCH_NOT_AVAILABLE", false, true],
    ["MESSAGE_SEARCH_RATE_LIMITED", false, false],
    ["MESSAGE_SEARCH_UNAVAILABLE", true, false],
    ["INTERNAL_ERROR", false, false],
  ] as const)("검색 오류 %s의 retry와 terminal 정책을 구분한다", (code, canRetry, terminal) => {
    const presentation = createRoomMessageSearchErrorPresentation(createError(code));

    expect(presentation).toMatchObject({ canRetry, terminal });
  });

  it.each([
    ["INVALID_REQUEST", false, false],
    ["ACCESS_DENIED", false, true],
    ["MESSAGE_NOT_FOUND", false, false],
    ["MESSAGE_SEARCH_NOT_AVAILABLE", false, true],
    ["MESSAGE_SEARCH_UNAVAILABLE", true, false],
    ["INTERNAL_ERROR", false, false],
  ] as const)("Context 오류 %s의 retry와 terminal 정책을 구분한다", (code, canRetry, terminal) => {
    const presentation = createRoomMessageContextErrorPresentation(createError(code));

    expect(presentation).toMatchObject({ canRetry, terminal });
  });

  it("network TypeError만 코드 없는 오류 중 재시도 가능하게 분류한다", () => {
    expect(createRoomMessageSearchErrorPresentation(new TypeError("fetch failed")).canRetry).toBe(
      true,
    );
    expect(createRoomMessageSearchErrorPresentation(new Error("unknown")).canRetry).toBe(false);
  });
});

function createError(code: string): ChatApiError {
  const status =
    code === "ACCESS_DENIED"
      ? 403
      : code === "MESSAGE_NOT_FOUND"
        ? 404
        : code === "MESSAGE_SEARCH_NOT_AVAILABLE"
          ? 409
          : code === "MESSAGE_SEARCH_RATE_LIMITED"
            ? 429
            : code === "MESSAGE_SEARCH_UNAVAILABLE"
              ? 503
              : code === "INTERNAL_ERROR"
                ? 500
                : 400;

  return new ChatApiError(status, "", "http://localhost:8082/rooms/room-01/messages/search", {
    type: `urn:hamcheeze:problem:${code.toLowerCase()}`,
    title: "Message search failed",
    status,
    detail: "Message search failed.",
    instance: "/api/v1/rooms/room-01/messages/search",
    code,
    replayed: false,
    retryable: code === "MESSAGE_SEARCH_UNAVAILABLE" || code === "MESSAGE_SEARCH_RATE_LIMITED",
    ...(code === "MESSAGE_SEARCH_RATE_LIMITED" ? { retryAfterMs: 250 } : {}),
  });
}
