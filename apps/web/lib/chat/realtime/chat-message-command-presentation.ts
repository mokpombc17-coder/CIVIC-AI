import type { ChatMessageCommandEvent } from "./chat-realtime-transport";
import type { ChatMessageCommandResult } from "./chat-stomp-contracts";

export type ChatMessageCommandFailurePresentation = Readonly<{
  message: string;
  retryAfterMs: number;
  retryable: boolean;
}>;

export function getChatMessageCommandFailurePresentation(
  event: ChatMessageCommandEvent,
): ChatMessageCommandFailurePresentation | null {
  if (event.kind === "failure") {
    return {
      message: event.message,
      retryAfterMs: 0,
      retryable: event.retryable,
    };
  }

  if (event.result.status === "ACCEPTED" || event.result.status === "DUPLICATE") {
    return null;
  }

  return {
    message: getServerCommandFailureMessage(event.result),
    retryAfterMs: event.result.retryAfterMs ?? 0,
    retryable: event.result.retryable,
  };
}

function getServerCommandFailureMessage(
  result: Extract<ChatMessageCommandResult, { status: "FAILED" | "REJECTED" }>,
): string {
  switch (result.code) {
    case "EMPTY_MESSAGE":
      return "메시지 내용을 입력해 주세요.";
    case "INVALID_CLIENT_MESSAGE_ID":
      return "메시지 요청 식별자가 올바르지 않습니다.";
    case "INVALID_CONTROL_CHARACTER":
      return "입력할 수 없는 문자가 포함되어 있어요. 해당 문자를 지워 주세요.";
    case "MESSAGE_TOO_LONG":
      return "메시지는 2,000자까지 입력할 수 있어요.";
    case "MESSAGE_TOO_LARGE":
      return "메시지가 너무 깁니다. 내용을 조금 줄여 주세요.";
    case "ROOM_SEND_FORBIDDEN":
      return "현재 사용자는 이 토론방에 메시지를 전송할 수 없습니다.";
    case "USER_RATE_LIMITED":
      return "메시지를 너무 빠르게 전송했습니다. 잠시 후 다시 시도해 주세요.";
    case "IDEMPOTENCY_CONFLICT":
      return "같은 메시지 요청 식별자가 다른 내용에 사용되었습니다.";
    case "SERVER_BUSY":
      return "채팅 서버가 혼잡합니다. 잠시 후 다시 시도해 주세요.";
    case "ROOM_AUTHORIZATION_UNAVAILABLE":
      return "토론방 권한을 일시적으로 확인할 수 없습니다.";
    case "CHAT_PIPELINE_UNAVAILABLE":
      return "채팅 처리 파이프라인을 일시적으로 사용할 수 없습니다.";
    case "PERSISTENCE_FAILED":
      return "메시지를 저장하지 못했습니다.";
    case "INTERNAL_ERROR":
      return "메시지 처리 중 서버 오류가 발생했습니다.";
    default:
      return `메시지 전송에 실패했습니다. (${result.code})`;
  }
}
