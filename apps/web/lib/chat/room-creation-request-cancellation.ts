import { ChatApiError } from "./chat-fetch";
import type { RoomCreationRequestResponse } from "./chat-room-contracts";

export type RoomCreationRequestCancellationResult =
  | Readonly<{
      kind: "canceled";
      request: RoomCreationRequestResponse;
    }>
  | Readonly<{
      kind: "conflict-refreshed";
      request: RoomCreationRequestResponse;
    }>
  | Readonly<{
      error: unknown;
      kind: "failed";
    }>;

export async function executeRoomCreationRequestCancellation({
  cancel,
  creationRequestId,
  refresh,
}: Readonly<{
  cancel: (creationRequestId: string) => Promise<RoomCreationRequestResponse>;
  creationRequestId: string;
  refresh: () => Promise<RoomCreationRequestResponse>;
}>): Promise<RoomCreationRequestCancellationResult> {
  try {
    return {
      kind: "canceled",
      request: await cancel(creationRequestId),
    };
  } catch (error) {
    if (!isRoomCreationDecisionConflict(error)) {
      return { error, kind: "failed" };
    }

    try {
      return {
        kind: "conflict-refreshed",
        request: await refresh(),
      };
    } catch (refreshError) {
      return { error: refreshError, kind: "failed" };
    }
  }
}

export function isRoomCreationDecisionConflict(error: unknown): boolean {
  return error instanceof ChatApiError && error.code === "ROOM_CREATION_DECISION_CONFLICT";
}

export function getRoomCreationRequestCancellationErrorMessage(error: unknown): string {
  if (!(error instanceof ChatApiError)) {
    return error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
  }

  switch (error.code) {
    case "UNAUTHENTICATED":
      return "다시 로그인한 뒤 신청을 취소해 주세요.";
    case "ACCESS_DENIED":
      return "현재 로그인한 사용자의 신청만 취소할 수 있습니다.";
    case "ROOM_CREATION_REQUEST_NOT_FOUND":
      return "신청을 찾을 수 없습니다. 신청 내역을 다시 확인해 주세요.";
    default:
      return error.message;
  }
}
