import { ChatApiError } from "./chat-fetch";

const ROOM_MEMBER_LIMIT_EXCEEDED_MESSAGE = "참여 인원이 가득 찬 채팅방입니다.";
const USER_ACTIVE_ROOM_LIMIT_EXCEEDED_MESSAGE =
  "참여 가능한 채팅방 수를 모두 사용했어요. 다른 참여 방에서 나간 뒤 다시 시도해 주세요.";
const JOIN_ROOM_ERROR_MESSAGES = {
  ROOM_CLOSED: "종료된 채팅방에는 참여할 수 없습니다.",
  JOIN_POLICY_NOT_OPEN: "현재 직접 참여할 수 없는 채팅방입니다.",
  MEMBERSHIP_BANNED: "이 채팅방에서 차단되어 참여할 수 없습니다.",
} as const;

export function getCreateRoomErrorMessage(error: unknown): string {
  return getUserActiveRoomLimitMessage(error) ?? getFallbackErrorMessage(error);
}

export function getJoinRoomErrorMessage(error: unknown): string {
  if (error instanceof ChatApiError && error.code === "ROOM_MEMBER_LIMIT_EXCEEDED") {
    return ROOM_MEMBER_LIMIT_EXCEEDED_MESSAGE;
  }

  if (error instanceof ChatApiError && error.code && error.code in JOIN_ROOM_ERROR_MESSAGES) {
    return JOIN_ROOM_ERROR_MESSAGES[error.code as keyof typeof JOIN_ROOM_ERROR_MESSAGES];
  }

  return getUserActiveRoomLimitMessage(error) ?? getFallbackErrorMessage(error);
}

export function shouldRefreshPublicRoomListAfterJoinError(error: unknown): boolean {
  return (
    error instanceof ChatApiError &&
    (error.code === "ROOM_CLOSED" || error.code === "JOIN_POLICY_NOT_OPEN")
  );
}

function getUserActiveRoomLimitMessage(error: unknown): string | null {
  return error instanceof ChatApiError && error.code === "USER_ACTIVE_ROOM_LIMIT_EXCEEDED"
    ? USER_ACTIVE_ROOM_LIMIT_EXCEEDED_MESSAGE
    : null;
}

function getFallbackErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
}
