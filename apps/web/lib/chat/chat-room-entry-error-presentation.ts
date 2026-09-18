import { ChatApiError } from "./chat-fetch";

export type ChatRoomEntryErrorPresentation = Readonly<{
  action: "retry" | "return-to-list";
  detail: string;
  title: string;
}>;

export function createChatRoomEntryErrorPresentation(
  error: unknown,
): ChatRoomEntryErrorPresentation {
  if (!(error instanceof ChatApiError)) {
    return retryablePresentation(getErrorMessage(error));
  }

  switch (error.code) {
    case "MEMBERSHIP_BANNED":
      return terminalPresentation("방장에 의해 토론방에서 퇴장되었습니다.");
    case "ROOM_CLOSED":
      return terminalPresentation("종료된 토론방입니다.");
    case "NOT_JOINED":
      return terminalPresentation("현재 참여 중인 토론방이 아닙니다.");
    case "ACCESS_DENIED":
      return terminalPresentation("이 토론방에 접근할 권한이 없습니다.");
    case "ROOM_NOT_FOUND":
      return terminalPresentation("토론방을 찾을 수 없습니다.");
    case "UNAUTHENTICATED":
      return terminalPresentation("토론방에 참여하려면 로그인이 필요합니다.");
    default:
      return retryablePresentation(error.message);
  }
}

function terminalPresentation(detail: string): ChatRoomEntryErrorPresentation {
  return {
    action: "return-to-list",
    detail,
    title: "토론방에 참여할 수 없습니다.",
  };
}

function retryablePresentation(detail: string): ChatRoomEntryErrorPresentation {
  return {
    action: "retry",
    detail,
    title: "토론방 정보를 불러오지 못했습니다.",
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
}
