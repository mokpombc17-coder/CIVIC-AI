import { describe, expect, it } from "vitest";
import { ChatApiError } from "./chat-fetch";
import { getJoinRoomErrorMessage } from "./chat-room-command-error-presentation";

describe("getJoinRoomErrorMessage", () => {
  it("정원 초과 오류를 사용자 문구로 변환한다", () => {
    const error = new ChatApiError(
      409,
      "Conflict",
      "http://localhost:8082/api/v1/rooms/room-01/commands/join",
      {
        type: "urn:hamcheeze:problem:room-member-limit-exceeded",
        title: "Room command rejected",
        status: 409,
        detail: "The room has reached its active member limit.",
        instance: "/api/v1/rooms/room-01/commands/join",
        code: "ROOM_MEMBER_LIMIT_EXCEEDED",
        clientRequestId: "07af9111-3e20-43e5-ae80-78d1bf547647",
        replayed: false,
        retryable: false,
      },
    );

    expect(error.code).toBe("ROOM_MEMBER_LIMIT_EXCEEDED");
    expect(error.retryable).toBe(false);
    expect(getJoinRoomErrorMessage(error)).toBe("참여 인원이 가득 찬 채팅방입니다.");
  });

  it("그 밖의 Error는 기존 메시지를 유지한다", () => {
    expect(getJoinRoomErrorMessage(new Error("기존 오류"))).toBe("기존 오류");
    expect(getJoinRoomErrorMessage(null)).toBe("알 수 없는 오류가 발생했습니다.");
  });
});
