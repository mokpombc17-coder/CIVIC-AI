import { ChatApiError } from "./chat-fetch";

const ROOM_MEMBER_LIMIT_EXCEEDED_MESSAGE = "참여 인원이 가득 찬 채팅방입니다.";
const USER_ACTIVE_ROOM_LIMIT_EXCEEDED_MESSAGE =
  "참여 가능한 채팅방 수를 모두 사용했어요. 다른 참여 방에서 나간 뒤 다시 시도해 주세요.";

export function getCreateRoomErrorMessage(error: unknown): string {
  return getUserActiveRoomLimitMessage(error) ?? getFallbackErrorMessage(error);
}

export function getJoinRoomErrorMessage(error: unknown): string {
  if (error instanceof ChatApiError && error.code === "ROOM_MEMBER_LIMIT_EXCEEDED") {
    return ROOM_MEMBER_LIMIT_EXCEEDED_MESSAGE;
  }

  return getUserActiveRoomLimitMessage(error) ?? getFallbackErrorMessage(error);
}

function getUserActiveRoomLimitMessage(error: unknown): string | null {
  return error instanceof ChatApiError && error.code === "USER_ACTIVE_ROOM_LIMIT_EXCEEDED"
    ? USER_ACTIVE_ROOM_LIMIT_EXCEEDED_MESSAGE
    : null;
}

function getFallbackErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
}
