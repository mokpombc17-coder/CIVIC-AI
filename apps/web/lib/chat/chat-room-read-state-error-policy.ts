import { ChatRestContractError } from "./chat-room-api";
import { ChatApiError, ChatResponseParseError } from "./chat-fetch";
import {
  ChatRoomReadStateTerminatedError,
  type ChatRoomReadStateFailureDisposition,
} from "./chat-room-read-state-coordinator";

export function classifyChatRoomReadStateFailure(
  error: unknown,
): ChatRoomReadStateFailureDisposition {
  if (error instanceof ChatApiError) {
    switch (error.code) {
      case "ROOM_INBOX_UNAVAILABLE":
        return "retryable";
      case "ACCESS_DENIED":
      case "READ_STATE_NOT_AVAILABLE":
        return "terminal";
      case "UNAUTHENTICATED":
      case "READ_SEQUENCE_AHEAD":
      case "READ_STATE_INCONSISTENT":
        return "blocked";
      default:
        return error.retryable ? "retryable" : "blocked";
    }
  }

  if (error instanceof ChatRestContractError || error instanceof ChatResponseParseError) {
    return "blocked";
  }

  return error instanceof TypeError ? "retryable" : "blocked";
}

export function canResumeChatRoomReadStateAfterSynchronization(error: unknown): boolean {
  if (error instanceof ChatRoomReadStateTerminatedError) {
    return error.reason !== "ROOM_CLOSED";
  }

  return (
    error instanceof ChatApiError &&
    (error.code === "ACCESS_DENIED" || error.code === "READ_SEQUENCE_AHEAD")
  );
}
