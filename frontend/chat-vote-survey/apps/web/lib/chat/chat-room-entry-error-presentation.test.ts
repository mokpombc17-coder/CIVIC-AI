import { describe, expect, it } from "vitest";
import { ChatApiError } from "./chat-fetch";
import { createChatRoomEntryErrorPresentation } from "./chat-room-entry-error-presentation";

describe("createChatRoomEntryErrorPresentation", () => {
  it("차단된 Membership은 목록으로 돌아가는 terminal 안내로 표현한다", () => {
    expect(createChatRoomEntryErrorPresentation(createApiError(403, "MEMBERSHIP_BANNED"))).toEqual({
      action: "return-to-list",
      detail: "방장에 의해 토론방에서 퇴장되었습니다.",
      title: "토론방에 참여할 수 없습니다.",
    });
  });

  it.each([
    ["ROOM_CLOSED", "종료된 토론방입니다."],
    ["NOT_JOINED", "현재 참여 중인 토론방이 아닙니다."],
    ["ACCESS_DENIED", "이 토론방에 접근할 권한이 없습니다."],
    ["ROOM_NOT_FOUND", "토론방을 찾을 수 없습니다."],
    ["UNAUTHENTICATED", "토론방에 참여하려면 로그인이 필요합니다."],
  ])("%s는 재시도 없이 목록 이동을 안내한다", (code, detail) => {
    expect(createChatRoomEntryErrorPresentation(createApiError(403, code))).toEqual({
      action: "return-to-list",
      detail,
      title: "토론방에 참여할 수 없습니다.",
    });
  });

  it("일시적인 상세 조회 실패는 같은 화면에서 재시도할 수 있게 한다", () => {
    expect(
      createChatRoomEntryErrorPresentation(new Error("네트워크 연결을 확인해 주세요.")),
    ).toEqual({
      action: "retry",
      detail: "네트워크 연결을 확인해 주세요.",
      title: "토론방 정보를 불러오지 못했습니다.",
    });
  });
});

function createApiError(status: number, code: string): ChatApiError {
  return new ChatApiError(status, "Error", "http://localhost/api/v1/rooms/room-a", {
    code,
    detail: code,
    instance: "/api/v1/rooms/room-a",
    replayed: false,
    retryable: false,
    status,
    title: "Room detail failed",
    type: "about:blank",
  });
}
