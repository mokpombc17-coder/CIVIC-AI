import { describe, expect, it } from "vitest";
import { ChatApiError } from "./chat-fetch";
import { getPublicRoomListErrorMessage } from "./chat-room-list-error-presentation";

describe("public Room list error presentation", () => {
  it.each([
    ["INVALID_REQUEST", 400, "검색 조건을 확인"],
    ["INVALID_CURSOR", 400, "처음부터 다시"],
    ["UNAUTHENTICATED", 401, "로그인이 필요"],
    ["ACCESS_DENIED", 403, "조회할 권한이 없습니다"],
    ["INTERNAL_ERROR", 500, "서버 오류"],
  ] as const)("%s 오류를 사용자 문구로 변환한다", (code, status, message) => {
    expect(getPublicRoomListErrorMessage(createError(code, status))).toContain(message);
  });

  it("network TypeError를 조회 실패와 구분한다", () => {
    expect(getPublicRoomListErrorMessage(new TypeError("Failed to fetch"))).toContain(
      "네트워크 연결",
    );
  });
});

function createError(code: string, status: number): ChatApiError {
  return new ChatApiError(status, "Request failed", "http://localhost/api/v1/rooms", {
    type: "urn:hamcheeze:problem:test",
    title: "Request failed",
    status,
    detail: "Request failed.",
    instance: "/api/v1/rooms",
    code,
    replayed: false,
    retryable: false,
  });
}
