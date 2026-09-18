import { describe, expect, it } from "vitest";
import { ChatApiError } from "./chat-fetch";
import {
  getCreateRoomErrorMessage,
  getJoinRoomErrorMessage,
  shouldRefreshPublicRoomListAfterJoinError,
} from "./chat-room-command-error-presentation";

const USER_QUOTA_MESSAGE =
  "참여 가능한 토론방 수를 모두 사용했어요. 다른 참여 방에서 나간 뒤 다시 시도해 주세요.";

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
    expect(getJoinRoomErrorMessage(error)).toBe("참여 인원이 가득 찬 토론방입니다.");
  });

  it.each([false, true])(
    "사용자 ACTIVE Room quota 오류를 CREATE/JOIN 공통 문구로 변환한다 (replayed=%s)",
    (replayed) => {
      const error = createUserActiveRoomLimitError(replayed);

      expect(error.code).toBe("USER_ACTIVE_ROOM_LIMIT_EXCEEDED");
      expect(error.retryable).toBe(false);
      expect(error.problem).toMatchObject({
        type: "urn:hamcheeze:problem:user-active-room-limit-exceeded",
        title: "Room command rejected",
        status: 409,
        detail: "The user has reached the active room limit.",
        clientRequestId: "07af9111-3e20-43e5-ae80-78d1bf547647",
        replayed,
        retryable: false,
      });
      expect(getCreateRoomErrorMessage(error)).toBe(USER_QUOTA_MESSAGE);
      expect(getJoinRoomErrorMessage(error)).toBe(USER_QUOTA_MESSAGE);
      expect(USER_QUOTA_MESSAGE).not.toContain("20");
    },
  );

  it.each([
    ["ROOM_CLOSED", "종료된 토론방에는 참여할 수 없습니다."],
    ["JOIN_POLICY_NOT_OPEN", "현재 직접 참여할 수 없는 토론방입니다."],
    ["MEMBERSHIP_BANNED", "이 토론방에서 차단되어 참여할 수 없습니다."],
  ] as const)("%s 오류를 참여 상황에 맞게 안내한다", (code, message) => {
    expect(getJoinRoomErrorMessage(createJoinError(code))).toBe(message);
  });

  it("목록에서 제거될 수 있는 종료·정책 변경 오류만 공개 목록을 갱신한다", () => {
    expect(shouldRefreshPublicRoomListAfterJoinError(createJoinError("ROOM_CLOSED"))).toBe(true);
    expect(shouldRefreshPublicRoomListAfterJoinError(createJoinError("JOIN_POLICY_NOT_OPEN"))).toBe(
      true,
    );
    expect(shouldRefreshPublicRoomListAfterJoinError(createJoinError("MEMBERSHIP_BANNED"))).toBe(
      false,
    );
    expect(shouldRefreshPublicRoomListAfterJoinError(createUserActiveRoomLimitError(false))).toBe(
      false,
    );
  });

  it("그 밖의 Error는 기존 메시지를 유지한다", () => {
    expect(getJoinRoomErrorMessage(new Error("기존 오류"))).toBe("기존 오류");
    expect(getJoinRoomErrorMessage(null)).toBe("알 수 없는 오류가 발생했습니다.");
  });
});

function createUserActiveRoomLimitError(replayed: boolean): ChatApiError {
  return new ChatApiError(409, "Conflict", "http://localhost:8082/api/v1/rooms", {
    type: "urn:hamcheeze:problem:user-active-room-limit-exceeded",
    title: "Room command rejected",
    status: 409,
    detail: "The user has reached the active room limit.",
    instance: "/api/v1/rooms",
    code: "USER_ACTIVE_ROOM_LIMIT_EXCEEDED",
    clientRequestId: "07af9111-3e20-43e5-ae80-78d1bf547647",
    replayed,
    retryable: false,
  });
}

function createJoinError(code: string): ChatApiError {
  return new ChatApiError(
    code === "MEMBERSHIP_BANNED" ? 403 : 409,
    "Request rejected",
    "http://localhost:8082/api/v1/rooms/room-01/commands/join",
    {
      type: "urn:hamcheeze:problem:test",
      title: "Room command rejected",
      status: code === "MEMBERSHIP_BANNED" ? 403 : 409,
      detail: "Room command rejected.",
      instance: "/api/v1/rooms/room-01/commands/join",
      code,
      replayed: false,
      retryable: false,
    },
  );
}
