import { describe, expect, it } from "vitest";
import { ChatApiError } from "../chat-fetch";
import { createChatRoomExportErrorPresentation } from "./chat-room-export-error-presentation";

function createApiError(status: number, code: string, retryable = false): ChatApiError {
  return new ChatApiError(status, "Error", "https://chat.example.test/exports", {
    type: `urn:hamcheeze:problem:${code.toLowerCase().replaceAll("_", "-")}`,
    title: "Chat export failed",
    status,
    detail: "Export failed.",
    instance: "/api/v1/admin/rooms/room-01/exports",
    code,
    replayed: false,
    retryable,
  });
}

describe("createChatRoomExportErrorPresentation", () => {
  it("base가 없으면 FULL Export를 권장한다", () => {
    expect(
      createChatRoomExportErrorPresentation(createApiError(409, "CHAT_EXPORT_BASE_NOT_FOUND")),
    ).toEqual({
      canRetry: false,
      detail: "변경분을 받으려면 전체 내역을 먼저 다운로드해 주세요.",
      recommendedMode: "FULL",
      title: "전체 내역 다운로드가 필요합니다.",
    });
  });

  it.each([
    ["CHAT_EXPORT_ALREADY_RUNNING", 409],
    ["CHAT_EXPORT_UNAVAILABLE", 503],
  ] as const)("%s는 사용자가 다시 시도할 수 있다", (code, status) => {
    expect(createChatRoomExportErrorPresentation(createApiError(status, code)).canRetry).toBe(true);
  });

  it.each([
    ["INVALID_REQUEST", 400],
    ["UNAUTHENTICATED", 401],
    ["ACCESS_DENIED", 403],
    ["ROOM_NOT_FOUND", 404],
    ["CHAT_EXPORT_TOO_LARGE", 413],
    ["CHAT_EXPORT_LEDGER_INCONSISTENT", 500],
    ["INTERNAL_ERROR", 500],
  ] as const)("%s는 자동 또는 즉시 재시도를 권장하지 않는다", (code, status) => {
    expect(createChatRoomExportErrorPresentation(createApiError(status, code))).toMatchObject({
      canRetry: false,
      recommendedMode: null,
    });
  });

  it("네트워크 실패는 수동 재시도를 허용한다", () => {
    expect(createChatRoomExportErrorPresentation(new TypeError("fetch failed"))).toMatchObject({
      canRetry: true,
      recommendedMode: null,
    });
  });

  it("알 수 없는 오류는 안전한 기본 안내를 사용한다", () => {
    expect(createChatRoomExportErrorPresentation(new Error("unexpected"))).toEqual({
      canRetry: false,
      detail: "예상하지 못한 오류가 발생했습니다.",
      recommendedMode: null,
      title: "채팅 내역 다운로드에 실패했습니다.",
    });
  });
});
