import { ChatApiError } from "./chat-fetch";
import type { RoomCreationRequestResponse } from "./chat-room-contracts";

export type RoomCreationRequestStatusPresentation = Readonly<{
  badgeLabel: string;
  description: string;
  title: string;
  tone: "info" | "success" | "danger" | "neutral";
}>;

export type RoomCreationRequestErrorPresentation = Readonly<{
  action: "retry" | "return-to-list";
  description: string;
  title: string;
}>;

export function createRoomCreationRequestStatusPresentation(
  request: RoomCreationRequestResponse,
): RoomCreationRequestStatusPresentation {
  switch (request.status) {
    case "PENDING":
      return statusPresentation(
        "승인 대기",
        request.name,
        "관리자가 요청을 검토하고 있습니다.",
        "info",
      );
    case "APPROVED":
      if (request.roomStatus === "CLOSED") {
        return statusPresentation(
          "종료됨",
          request.name,
          "생성된 토론방의 운영이 종료되었습니다.",
          "neutral",
        );
      }

      return statusPresentation("생성 완료", request.name, "토론방이 생성되었습니다.", "success");
    case "REJECTED":
      return statusPresentation("반려", request.name, request.rejectionReason, "danger");
    case "CANCELED":
      return statusPresentation("신청 취소", request.name, "취소된 요청입니다.", "neutral");
  }
}

export function createRoomCreationRequestErrorPresentation(
  error: unknown,
): RoomCreationRequestErrorPresentation {
  if (!(error instanceof ChatApiError)) {
    return retryableError(getErrorMessage(error));
  }

  switch (error.code) {
    case "ROOM_CREATION_REQUEST_NOT_FOUND":
      return terminalError("신청을 찾을 수 없습니다.", "신청 목록에서 최신 내역을 확인해 주세요.");
    case "UNAUTHENTICATED":
      return terminalError("로그인이 필요합니다.", "다시 로그인한 뒤 신청 내역을 확인해 주세요.");
    case "ACCESS_DENIED":
      return terminalError(
        "신청을 확인할 권한이 없습니다.",
        "현재 로그인한 사용자의 신청만 확인할 수 있습니다.",
      );
    default:
      return retryableError(error.message);
  }
}

export function createRoomCreationRequestListErrorMessage(error: unknown): string {
  if (!(error instanceof ChatApiError)) {
    return getErrorMessage(error);
  }

  switch (error.code) {
    case "UNAUTHENTICATED":
      return "다시 로그인한 뒤 신청 내역을 확인해 주세요.";
    case "ACCESS_DENIED":
      return "현재 로그인한 사용자의 신청 내역을 확인할 수 없습니다.";
    case "INVALID_CURSOR":
      return "신청 내역의 페이지 정보가 만료되어 처음부터 다시 불러옵니다.";
    default:
      return error.message;
  }
}

export function formatRoomCreationRequestInstant(instant: string): string {
  return ROOM_CREATION_REQUEST_DATE_TIME_FORMATTER.format(new Date(instant));
}

function statusPresentation(
  badgeLabel: string,
  title: string,
  description: string,
  tone: RoomCreationRequestStatusPresentation["tone"],
): RoomCreationRequestStatusPresentation {
  return { badgeLabel, description, title, tone };
}

function terminalError(title: string, description: string): RoomCreationRequestErrorPresentation {
  return { action: "return-to-list", description, title };
}

function retryableError(description: string): RoomCreationRequestErrorPresentation {
  return {
    action: "retry",
    description,
    title: "신청 상태를 불러오지 못했습니다.",
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
}

const ROOM_CREATION_REQUEST_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Seoul",
});
