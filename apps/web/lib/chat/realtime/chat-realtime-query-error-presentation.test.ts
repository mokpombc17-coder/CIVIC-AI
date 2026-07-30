import { describe, expect, it } from "vitest";
import { ChatApiError } from "../chat-fetch";
import { ChatMessageMergeConflictError } from "../chat-message-merge";
import { ChatMessageRecoveryError } from "./chat-message-recovery";
import {
  getChatRealtimeQueryErrorPresentation,
  type ChatRealtimeQueryErrorAction,
} from "./chat-realtime-query-error-presentation";
import { ChatRealtimeQueryCoordinatorError } from "./chat-realtime-query-coordinator";

describe("getChatRealtimeQueryErrorPresentation", () => {
  it.each<[ChatRealtimeQueryCoordinatorError["code"], ChatRealtimeQueryErrorAction]>([
    ["BUFFER_OVERFLOW", "reload"],
    ["INVALID_REALTIME_EVENT", "reload"],
    ["ROOM_EVENT_JOURNAL_MISMATCH", "reload"],
    ["ROOM_EVENT_CONFLICT", "reload"],
    ["MESSAGE_HISTORY_NOT_READY", "retry"],
    ["MESSAGE_SEQUENCE_GAP", "retry"],
  ])("%s 오류의 안전한 복구 동작을 선택한다", (code, action) => {
    const error = new ChatRealtimeQueryCoordinatorError(code, "테스트 오류");

    expect(getChatRealtimeQueryErrorPresentation(error).action).toBe(action);
  });

  it("afterSequence 복구 실패는 같은 snapshot에서 다시 시도한다", () => {
    const error = new ChatMessageRecoveryError(
      "MESSAGE_RECOVERY_INCOMPLETE",
      "목표 sequence까지 복구하지 못했습니다.",
    );

    expect(getChatRealtimeQueryErrorPresentation(error)).toMatchObject({
      action: "retry",
      actionLabel: "메시지 다시 동기화",
    });
  });

  it("인증 오류는 무의미한 동기화 재시도 버튼을 제공하지 않는다", () => {
    const error = new ChatApiError(401, "Unauthorized", "http://localhost:8082", {
      code: "UNAUTHENTICATED",
    });

    expect(getChatRealtimeQueryErrorPresentation(error)).toMatchObject({
      action: null,
      actionLabel: null,
      title: "채팅 인증이 필요합니다.",
    });
  });

  it("네트워크 오류는 동기화를 다시 시도할 수 있다", () => {
    expect(getChatRealtimeQueryErrorPresentation(new TypeError("Failed to fetch"))).toMatchObject({
      action: "retry",
      actionLabel: "메시지 다시 동기화",
    });
  });

  it("메시지 불변 필드 충돌은 현재 세션을 초기화한다", () => {
    const message = {
      messageId: "message-01",
      roomId: "room-01",
      roomSequence: 1,
      senderUserId: "user-01",
      clientMessageId: "550e8400-e29b-41d4-a716-446655440000",
      content: "안녕하세요.",
      createdAt: "2026-07-30T00:00:00Z",
    };
    const error = new ChatMessageMergeConflictError("ROOM_SEQUENCE_CONFLICT", message, message);

    expect(getChatRealtimeQueryErrorPresentation(error).action).toBe("reload");
  });

  it("재시도할 수 없는 HTTP 오류는 반복 요청을 제공하지 않는다", () => {
    const error = new ChatApiError(400, "Bad Request", "http://localhost:8082", {
      code: "INVALID_REQUEST",
    });

    expect(getChatRealtimeQueryErrorPresentation(error).action).toBeNull();
  });
});
