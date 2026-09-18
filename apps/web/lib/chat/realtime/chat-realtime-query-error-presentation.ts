import { ChatApiError, ChatResponseParseError } from "../chat-fetch";
import { CHAT_AUTHENTICATION_REQUIRED_MESSAGE } from "../chat-authentication-required";
import { ChatMessageMergeConflictError } from "../chat-message-merge";
import { ChatMessageRecoveryError } from "./chat-message-recovery";
import { ChatRealtimeQueryCoordinatorError } from "./chat-realtime-query-coordinator";

export type ChatRealtimeQueryErrorAction = "retry" | "reload" | null;

export type ChatRealtimeQueryErrorPresentation = Readonly<{
  action: ChatRealtimeQueryErrorAction;
  actionLabel: string | null;
  description: string;
  title: string;
}>;

export function getChatRealtimeQueryErrorPresentation(
  error: Error,
): ChatRealtimeQueryErrorPresentation {
  if (error instanceof ChatRealtimeQueryCoordinatorError) {
    return getCoordinatorErrorPresentation(error);
  }

  if (error instanceof ChatMessageRecoveryError) {
    return {
      action: "retry",
      actionLabel: "메시지 다시 동기화",
      description: error.message,
      title: "놓친 메시지를 복구하지 못했습니다.",
    };
  }

  if (
    error instanceof ChatMessageMergeConflictError ||
    error instanceof ChatResponseParseError ||
    error.name === "ZodError"
  ) {
    return reloadPresentation(
      "채팅 데이터 계약이 서로 일치하지 않습니다.",
      "잘못된 데이터를 화면에 반영하지 않도록 현재 세션을 초기화해야 합니다.",
    );
  }

  if (error instanceof ChatApiError) {
    if (error.status === 401) {
      return {
        action: null,
        actionLabel: null,
        description: CHAT_AUTHENTICATION_REQUIRED_MESSAGE,
        title: "채팅 인증이 필요합니다.",
      };
    }

    if (error.status === 403) {
      return {
        action: null,
        actionLabel: null,
        description: "현재 사용자는 이 토론방의 메시지 이력을 조회할 수 없습니다.",
        title: "토론방 접근 권한이 없습니다.",
      };
    }

    if (error.retryable || error.status >= 500) {
      return retryPresentation("메시지 이력을 다시 불러오지 못했습니다.", error.message);
    }

    return {
      action: null,
      actionLabel: null,
      description: error.message,
      title: "메시지 이력을 불러올 수 없습니다.",
    };
  }

  return retryPresentation("실시간 메시지를 화면에 반영하지 못했습니다.", error.message);
}

function getCoordinatorErrorPresentation(
  error: ChatRealtimeQueryCoordinatorError,
): ChatRealtimeQueryErrorPresentation {
  switch (error.code) {
    case "BUFFER_OVERFLOW":
      return reloadPresentation(
        "실시간 이벤트 버퍼의 한도를 초과했습니다.",
        "일부 실시간 이벤트가 유실될 수 있어 현재 세션을 초기화하고 다시 동기화해야 합니다.",
      );
    case "INVALID_REALTIME_EVENT":
      return reloadPresentation(
        "서버 이벤트를 해석하지 못했습니다.",
        "현재 프론트엔드와 서버의 실시간 이벤트 계약이 일치하지 않을 수 있습니다.",
      );
    case "ROOM_EVENT_JOURNAL_MISMATCH":
    case "ROOM_EVENT_CONFLICT":
      return reloadPresentation(
        "토론방 상태 이벤트가 서로 일치하지 않습니다.",
        "잘못된 방 상태를 표시하지 않도록 현재 세션을 초기화해야 합니다.",
      );
    case "MESSAGE_HISTORY_NOT_READY":
    case "MESSAGE_SEQUENCE_GAP":
      return retryPresentation("놓친 메시지를 동기화하지 못했습니다.", error.message);
  }
}

function retryPresentation(title: string, description: string): ChatRealtimeQueryErrorPresentation {
  return {
    action: "retry",
    actionLabel: "메시지 다시 동기화",
    description,
    title,
  };
}

function reloadPresentation(
  title: string,
  description: string,
): ChatRealtimeQueryErrorPresentation {
  return {
    action: "reload",
    actionLabel: "페이지 새로고침",
    description,
    title,
  };
}
