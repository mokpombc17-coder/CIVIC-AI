import { ChatApiError } from "./chat-fetch";

export function getPublicRoomListErrorMessage(error: unknown): string {
  if (error instanceof ChatApiError) {
    switch (error.code) {
      case "INVALID_REQUEST":
        return "검색 조건을 확인한 뒤 다시 시도해 주세요.";
      case "INVALID_CURSOR":
        return "검색 결과가 변경되었습니다. 처음부터 다시 불러와 주세요.";
      case "UNAUTHENTICATED":
        return "공개 방을 조회하려면 로그인이 필요합니다.";
      case "ACCESS_DENIED":
        return "공개 방을 조회할 권한이 없습니다.";
      default:
        if (error.status >= 500) {
          return "공개 방을 불러오는 중 서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
        }
    }
  }

  if (error instanceof TypeError) {
    return "서버에 연결하지 못했습니다. 네트워크 연결을 확인해 주세요.";
  }

  return error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
}
