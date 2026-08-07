import { describe, expect, it } from "vitest";
import { ChatApiError, ChatResponseParseError } from "./chat-fetch";
import { ChatRoomReadStateTerminatedError } from "./chat-room-read-state-coordinator";
import {
  canResumeChatRoomReadStateAfterSynchronization,
  classifyChatRoomReadStateFailure,
} from "./chat-room-read-state-error-policy";

describe("classifyChatRoomReadStateFailure", () => {
  it.each(["ROOM_INBOX_UNAVAILABLE"])("%s는 lifecycle 재시도 대상으로 보존한다", (code) => {
    expect(classifyChatRoomReadStateFailure(createApiError(503, code, true))).toBe("retryable");
  });

  it("network TypeError는 lifecycle 재시도 대상으로 보존한다", () => {
    expect(classifyChatRoomReadStateFailure(new TypeError("Failed to fetch"))).toBe("retryable");
  });

  it.each(["UNAUTHENTICATED", "READ_SEQUENCE_AHEAD", "READ_STATE_INCONSISTENT"])(
    "%s는 자동 lifecycle 재시도를 막는 blocked 상태다",
    (code) => {
      expect(classifyChatRoomReadStateFailure(createApiError(409, code, false))).toBe("blocked");
    },
  );

  it.each(["ACCESS_DENIED", "READ_STATE_NOT_AVAILABLE"])(
    "%s는 현재 Room 처리를 끝내는 terminal 상태다",
    (code) => {
      expect(classifyChatRoomReadStateFailure(createApiError(403, code, false))).toBe("terminal");
    },
  );

  it("응답 JSON 해석 실패는 무한 재시도하지 않는 blocked 상태다", () => {
    expect(
      classifyChatRoomReadStateFailure(
        new ChatResponseParseError(200, "http://localhost/api/v1/rooms/room-a/read-state", {
          cause: new SyntaxError("invalid JSON"),
        }),
      ),
    ).toBe("blocked");
  });
});

describe("canResumeChatRoomReadStateAfterSynchronization", () => {
  it.each(["ACCESS_DENIED", "READ_SEQUENCE_AHEAD"])(
    "%s는 새 Room synchronization 후 재평가할 수 있다",
    (code) => {
      expect(canResumeChatRoomReadStateAfterSynchronization(createApiError(409, code, false))).toBe(
        true,
      );
    },
  );

  it.each(["UNAUTHENTICATED", "READ_STATE_NOT_AVAILABLE", "READ_STATE_INCONSISTENT"])(
    "%s는 Room synchronization만으로 해제하지 않는다",
    (code) => {
      expect(canResumeChatRoomReadStateAfterSynchronization(createApiError(409, code, false))).toBe(
        false,
      );
    },
  );

  it("재참여 가능한 local terminal은 새 Room synchronization 후 해제할 수 있다", () => {
    expect(
      canResumeChatRoomReadStateAfterSynchronization(
        new ChatRoomReadStateTerminatedError("room-a", "LEFT"),
      ),
    ).toBe(true);
    expect(
      canResumeChatRoomReadStateAfterSynchronization(
        new ChatRoomReadStateTerminatedError("room-a", "ROOM_CLOSED"),
      ),
    ).toBe(false);
  });
});

function createApiError(status: number, code: string, retryable: boolean): ChatApiError {
  return new ChatApiError(status, "Error", "http://localhost/api/v1/rooms/room-a/read-state", {
    type: `urn:hamcheeze:problem:${code.toLowerCase()}`,
    title: "Room read-state rejected",
    status,
    detail: code,
    instance: "/api/v1/rooms/room-a/read-state",
    code,
    replayed: false,
    retryable,
  });
}
