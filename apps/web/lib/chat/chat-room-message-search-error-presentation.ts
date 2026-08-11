import { ChatApiError } from "./chat-fetch";

export type RoomMessageSearchErrorPresentation = Readonly<{
  canRetry: boolean;
  detail: string;
  terminal: boolean;
  title: string;
}>;

export function createRoomMessageSearchErrorPresentation(
  error: unknown,
): RoomMessageSearchErrorPresentation {
  if (error instanceof TypeError) {
    return retryableNetworkPresentation("메시지 검색에 실패했습니다.");
  }

  if (!(error instanceof ChatApiError)) {
    return nonRetryablePresentation(
      "메시지 검색에 실패했습니다.",
      "예상하지 못한 오류가 발생했습니다.",
    );
  }

  switch (error.code) {
    case "INVALID_REQUEST":
      return nonRetryablePresentation(
        "검색어를 확인해 주세요.",
        "검색 조건이 올바르지 않습니다. 검색어를 수정한 뒤 새로 검색해 주세요.",
      );
    case "INVALID_CURSOR":
      return nonRetryablePresentation(
        "검색을 이어갈 수 없습니다.",
        "검색을 초기화한 뒤 처음부터 다시 시작해 주세요.",
      );
    case "ACCESS_DENIED":
      return terminalPresentation(
        "메시지를 검색할 수 없습니다.",
        "현재 채팅방의 메시지에 접근할 수 없습니다.",
      );
    case "MESSAGE_SEARCH_NOT_AVAILABLE":
      return terminalPresentation(
        "메시지 검색을 종료했습니다.",
        "종료된 채팅방에서는 메시지를 검색할 수 없습니다.",
      );
    case "MESSAGE_SEARCH_RATE_LIMITED":
      return nonRetryablePresentation(
        "검색 요청이 몰려 잠시 후 자동으로 다시 시도합니다.",
        "잠시만 기다려 주세요.",
      );
    case "MESSAGE_SEARCH_UNAVAILABLE":
      return {
        canRetry: true,
        detail:
          "검색 서비스를 일시적으로 사용할 수 없습니다. 같은 검색 위치에서 다시 시도할 수 있습니다.",
        terminal: false,
        title: "메시지 검색에 실패했습니다.",
      };
    case "INTERNAL_ERROR":
      return nonRetryablePresentation(
        "메시지 검색에 실패했습니다.",
        "서버 오류가 발생했습니다. 같은 요청을 자동으로 반복하지 않습니다.",
      );
    default:
      return nonRetryablePresentation("메시지 검색에 실패했습니다.", error.message);
  }
}

export function createRoomMessageContextErrorPresentation(
  error: unknown,
): RoomMessageSearchErrorPresentation {
  if (error instanceof TypeError) {
    return retryableNetworkPresentation("주변 대화를 불러오지 못했습니다.");
  }

  if (!(error instanceof ChatApiError)) {
    return nonRetryablePresentation(
      "주변 대화를 불러오지 못했습니다.",
      "예상하지 못한 오류가 발생했습니다.",
    );
  }

  switch (error.code) {
    case "INVALID_REQUEST":
      return nonRetryablePresentation(
        "주변 대화를 불러오지 못했습니다.",
        "메시지 또는 조회 범위가 올바르지 않습니다.",
      );
    case "ACCESS_DENIED":
      return terminalPresentation(
        "주변 대화를 볼 수 없습니다.",
        "현재 채팅방의 메시지에 접근할 수 없습니다.",
      );
    case "MESSAGE_NOT_FOUND":
      return nonRetryablePresentation(
        "메시지를 찾을 수 없습니다.",
        "메시지가 삭제되었거나 더 이상 접근할 수 없습니다. 검색 결과로 돌아가 주세요.",
      );
    case "MESSAGE_SEARCH_NOT_AVAILABLE":
      return terminalPresentation(
        "주변 대화 조회를 종료했습니다.",
        "종료된 채팅방에서는 주변 대화를 조회할 수 없습니다.",
      );
    case "MESSAGE_SEARCH_UNAVAILABLE":
      return {
        canRetry: true,
        detail: "주변 대화 조회를 일시적으로 사용할 수 없습니다. 다시 시도해 주세요.",
        terminal: false,
        title: "주변 대화를 불러오지 못했습니다.",
      };
    case "INTERNAL_ERROR":
      return nonRetryablePresentation(
        "주변 대화를 불러오지 못했습니다.",
        "서버 오류가 발생했습니다. 같은 요청을 자동으로 반복하지 않습니다.",
      );
    default:
      return nonRetryablePresentation("주변 대화를 불러오지 못했습니다.", error.message);
  }
}

function retryableNetworkPresentation(title: string): RoomMessageSearchErrorPresentation {
  return {
    canRetry: true,
    detail: "네트워크 연결을 확인한 뒤 다시 시도해 주세요.",
    terminal: false,
    title,
  };
}

function nonRetryablePresentation(
  title: string,
  detail: string,
): RoomMessageSearchErrorPresentation {
  return { canRetry: false, detail, terminal: false, title };
}

function terminalPresentation(title: string, detail: string): RoomMessageSearchErrorPresentation {
  return { canRetry: false, detail, terminal: true, title };
}
