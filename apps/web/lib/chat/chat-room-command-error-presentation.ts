import { ChatApiError } from "./chat-fetch";

const ROOM_MEMBER_LIMIT_EXCEEDED_MESSAGE = "참여 인원이 가득 찬 채팅방입니다.";

export function getJoinRoomErrorMessage(error: unknown): string {
  if (error instanceof ChatApiError && error.code === "ROOM_MEMBER_LIMIT_EXCEEDED") {
    return ROOM_MEMBER_LIMIT_EXCEEDED_MESSAGE;
  }

  return error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
}
