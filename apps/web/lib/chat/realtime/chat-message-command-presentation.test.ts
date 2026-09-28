import { describe, expect, it } from "vitest";
import { getChatMessageCommandFailurePresentation } from "./chat-message-command-presentation";
import type { ChatMessageCommandEvent } from "./chat-realtime-transport";

const CLIENT_MESSAGE_ID = "550e8400-e29b-41d4-a716-446655440000";

describe("getChatMessageCommandFailurePresentation", () => {
  it("ACCEPTED와 DUPLICATE는 성공 결과로 처리한다", () => {
    for (const status of ["ACCEPTED", "DUPLICATE"] as const) {
      const event: ChatMessageCommandEvent = {
        kind: "result",
        roomId: "room-01",
        result: {
          clientMessageId: CLIENT_MESSAGE_ID,
          status,
          code: null,
          retryable: false,
          retryAfterMs: null,
          messageId: "message-01",
          roomSequence: 1,
        },
      };

      expect(getChatMessageCommandFailurePresentation(event)).toBeNull();
    }
  });

  it("서버 실패의 retryAfterMs와 retryable 계약을 유지한다", () => {
    const event: ChatMessageCommandEvent = {
      kind: "result",
      roomId: "room-01",
      result: {
        clientMessageId: CLIENT_MESSAGE_ID,
        status: "FAILED",
        code: "PERSISTENCE_FAILED",
        retryable: true,
        retryAfterMs: 1_500,
        messageId: null,
        roomSequence: null,
      },
    };

    expect(getChatMessageCommandFailurePresentation(event)).toEqual({
      message: "메시지를 저장하지 못했습니다.",
      retryable: true,
      retryAfterMs: 1_500,
    });
  });

  it.each([
    ["EMPTY_MESSAGE", "메시지 내용을 입력해 주세요."],
    [
      "INVALID_CONTROL_CHARACTER",
      "입력할 수 없는 문자가 포함되어 있어요. 해당 문자를 지워 주세요.",
    ],
    ["MESSAGE_TOO_LONG", "메시지는 2,000자까지 입력할 수 있어요."],
    ["MESSAGE_TOO_LARGE", "메시지가 너무 깁니다. 내용을 조금 줄여 주세요."],
  ] as const)("%s 실패를 사용자 친화적인 문구로 안내한다", (code, message) => {
    const event: ChatMessageCommandEvent = {
      kind: "result",
      roomId: "room-01",
      result: {
        clientMessageId: CLIENT_MESSAGE_ID,
        status: "REJECTED",
        code,
        retryable: false,
        retryAfterMs: null,
        messageId: null,
        roomSequence: null,
      },
    };

    expect(getChatMessageCommandFailurePresentation(event)?.message).toBe(message);
  });

  it("Worker의 로컬 전송 실패도 동일한 화면 계약으로 변환한다", () => {
    const event: ChatMessageCommandEvent = {
      kind: "failure",
      roomId: "room-01",
      clientMessageId: CLIENT_MESSAGE_ID,
      code: "CONNECTION_NOT_READY",
      retryable: true,
      message: "연결이 준비되지 않았습니다.",
    };

    expect(getChatMessageCommandFailurePresentation(event)).toEqual({
      message: "연결이 준비되지 않았습니다.",
      retryable: true,
      retryAfterMs: 0,
    });
  });
});
