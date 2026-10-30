import { ChatApiError } from "../chat-fetch";
import type { ChatRoomExportMode } from "./chat-room-export-contracts";

export type ChatRoomExportErrorPresentation = Readonly<{
  canRetry: boolean;
  detail: string;
  recommendedMode: ChatRoomExportMode | null;
  title: string;
}>;

export function createChatRoomExportErrorPresentation(
  error: unknown,
): ChatRoomExportErrorPresentation {
  if (error instanceof TypeError) {
    return retryablePresentation(
      "채팅 내역 다운로드에 실패했습니다.",
      "네트워크 연결을 확인한 뒤 다시 시도해 주세요.",
    );
  }

  if (!(error instanceof ChatApiError)) {
    return nonRetryablePresentation(
      "채팅 내역 다운로드에 실패했습니다.",
      "예상하지 못한 오류가 발생했습니다.",
    );
  }

  switch (error.code) {
    case "INVALID_REQUEST":
      return nonRetryablePresentation(
        "채팅 내역을 요청할 수 없습니다.",
        "요청한 방과 다운로드 방식을 확인해 주세요.",
      );
    case "UNAUTHENTICATED":
      return nonRetryablePresentation(
        "관리자 로그인이 필요합니다.",
        "다시 로그인한 뒤 채팅 내역을 다운로드해 주세요.",
      );
    case "ACCESS_DENIED":
      return nonRetryablePresentation(
        "채팅 내역을 다운로드할 권한이 없습니다.",
        "Super Admin 권한이 있는 계정으로 다시 시도해 주세요.",
      );
    case "ROOM_NOT_FOUND":
      return nonRetryablePresentation(
        "토론방을 찾을 수 없습니다.",
        "토론방이 존재하는지 확인해 주세요.",
      );
    case "CHAT_EXPORT_ALREADY_RUNNING":
      return retryablePresentation(
        "채팅 내역을 생성하고 있습니다.",
        "현재 Export가 끝난 뒤 다시 시도해 주세요.",
      );
    case "CHAT_EXPORT_BASE_NOT_FOUND":
      return {
        canRetry: false,
        detail: "변경분을 받으려면 전체 내역을 먼저 다운로드해 주세요.",
        recommendedMode: "FULL",
        title: "전체 내역 다운로드가 필요합니다.",
      };
    case "CHAT_EXPORT_TOO_LARGE":
      return nonRetryablePresentation(
        "채팅 내역을 다운로드할 수 없습니다.",
        "채팅 내역이 Export 허용 범위를 초과했습니다.",
      );
    case "CHAT_EXPORT_LEDGER_INCONSISTENT":
      return nonRetryablePresentation(
        "채팅 감사 내역을 확인할 수 없습니다.",
        "서버 관리자에게 문의해 주세요.",
      );
    case "CHAT_EXPORT_UNAVAILABLE":
      return retryablePresentation(
        "현재 채팅 내역을 생성할 수 없습니다.",
        "잠시 후 다시 시도해 주세요.",
      );
    case "INTERNAL_ERROR":
      return nonRetryablePresentation(
        "채팅 내역 다운로드에 실패했습니다.",
        "서버 오류가 발생했습니다. 같은 요청을 자동으로 반복하지 않습니다.",
      );
    default:
      return nonRetryablePresentation("채팅 내역 다운로드에 실패했습니다.", error.message);
  }
}

function retryablePresentation(title: string, detail: string): ChatRoomExportErrorPresentation {
  return { canRetry: true, detail, recommendedMode: null, title };
}

function nonRetryablePresentation(title: string, detail: string): ChatRoomExportErrorPresentation {
  return { canRetry: false, detail, recommendedMode: null, title };
}
