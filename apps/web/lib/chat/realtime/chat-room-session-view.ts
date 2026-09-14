import type {
  ChatConnectionStatus,
  ChatRealtimeError,
  ChatRoomSessionError,
  ChatRoomSessionSnapshot,
} from "./chat-realtime-transport";
import type { RoomStatus } from "../chat-room-contracts";

type ChatRoomSessionViewInput = ChatRoomSessionSnapshot & {
  connectionError?: ChatRealtimeError | null;
  connectionStatus?: ChatConnectionStatus;
};

export type ChatRoomSessionView =
  | {
      kind: "active";
      title: string;
      description: string;
      canDraft: true;
      canReactivate: false;
      canReconnect: false;
      indicatorLabel: string;
      indicatorTone: "positive";
      showNotice: false;
    }
  | {
      kind: "authentication-required" | "pending" | "replaced" | "closed" | "error";
      title: string;
      description: string;
      canDraft: false;
      canReactivate: boolean;
      canReconnect: boolean;
      indicatorLabel: string;
      indicatorTone: "pending" | "negative";
      showNotice: boolean;
    };

export function getChatRoomSessionView(
  snapshot: ChatRoomSessionViewInput,
  roomId: string,
  realtimeReady = true,
  roomStatus?: RoomStatus,
): ChatRoomSessionView {
  if (roomStatus === "CLOSED") {
    return {
      kind: "closed",
      title: "종료된 채팅방입니다.",
      description: "종료된 채팅방에서는 새 메시지를 보내거나 지난 대화 내역을 확인할 수 없습니다.",
      canDraft: false,
      canReactivate: false,
      canReconnect: false,
      indicatorLabel: "종료됨",
      indicatorTone: "pending",
      showNotice: true,
    };
  }

  if (snapshot.connectionStatus === "replaced") {
    return {
      kind: "error",
      title: "다른 환경에서 채팅 연결을 사용 중입니다.",
      description:
        snapshot.connectionError?.message ??
        "다른 브라우저, 프로필 또는 기기의 연결이 종료된 뒤 페이지를 새로고침해 주세요.",
      canDraft: false,
      canReactivate: false,
      canReconnect: false,
      indicatorLabel: "채팅 불가",
      indicatorTone: "negative",
      showNotice: true,
    };
  }

  if (snapshot.connectionStatus === "authentication-required") {
    return {
      kind: "authentication-required",
      title: "채팅을 계속하려면 로그인이 필요합니다.",
      description:
        snapshot.connectionError?.message ??
        "로그인을 완료하면 실시간 채팅 연결이 자동으로 다시 시작됩니다.",
      canDraft: false,
      canReactivate: false,
      canReconnect: false,
      indicatorLabel: "로그인 필요",
      indicatorTone: "negative",
      showNotice: true,
    };
  }

  if (
    snapshot.connectionStatus === "error" ||
    (snapshot.connectionStatus === "disconnected" && snapshot.connectionError != null)
  ) {
    return {
      kind: "error",
      title: "실시간 채팅 연결을 사용할 수 없습니다.",
      description: snapshot.connectionError?.message ?? "다시 연결해 채팅을 복구해 주세요.",
      canDraft: false,
      canReactivate: false,
      canReconnect: true,
      indicatorLabel: "채팅 불가",
      indicatorTone: "negative",
      showNotice: true,
    };
  }

  if (snapshot.connectionStatus !== undefined && snapshot.connectionStatus !== "connected") {
    return {
      kind: "pending",
      title: "실시간 채팅 연결을 준비하고 있습니다.",
      description: "서버 연결과 방 구독이 완료될 때까지 메시지 입력을 잠시 기다려 주세요.",
      canDraft: false,
      canReactivate: false,
      canReconnect: false,
      indicatorLabel: "준비 중",
      indicatorTone: "pending",
      showNotice: false,
    };
  }

  if (snapshot.status === "active" && snapshot.roomId === roomId) {
    if (!realtimeReady) {
      return {
        kind: "pending",
        title: "채팅 내용을 동기화하고 있습니다.",
        description: "최신 메시지 동기화가 끝날 때까지 잠시 기다려 주세요.",
        canDraft: false,
        canReactivate: false,
        canReconnect: false,
        indicatorLabel: "준비 중",
        indicatorTone: "pending",
        showNotice: false,
      };
    }

    return {
      kind: "active",
      title: "이 탭에서 실시간 채팅을 사용 중입니다.",
      description: "다른 탭에서 채팅방을 활성화하면 이 탭의 입력이 중지됩니다.",
      canDraft: true,
      canReactivate: false,
      canReconnect: false,
      indicatorLabel: "채팅 가능",
      indicatorTone: "positive",
      showNotice: false,
    };
  }

  if (snapshot.status === "replaced" && snapshot.roomId === roomId) {
    return {
      kind: "replaced",
      title: "다른 탭에서 채팅방을 사용 중입니다.",
      description:
        "작성 중인 내용은 유지되며, 이 탭을 다시 활성화하면 다른 탭의 입력이 중지됩니다.",
      canDraft: false,
      canReactivate: true,
      canReconnect: false,
      indicatorLabel: "다른 탭 사용 중",
      indicatorTone: "pending",
      showNotice: true,
    };
  }

  if (snapshot.status === "error" && snapshot.roomId === roomId) {
    return {
      kind: "error",
      title: "채팅방 실시간 연결을 활성화하지 못했습니다.",
      description: snapshot.error?.message ?? "잠시 후 이 탭에서 다시 활성화해 주세요.",
      canDraft: false,
      canReactivate: canReactivateRoomError(snapshot.error),
      canReconnect: false,
      indicatorLabel: "채팅 불가",
      indicatorTone: "negative",
      showNotice: true,
    };
  }

  return {
    kind: "pending",
    title: "채팅방 실시간 연결을 준비하고 있습니다.",
    description: "방 구독이 완료될 때까지 메시지 입력을 잠시 기다려 주세요.",
    canDraft: false,
    canReactivate: snapshot.status === "idle",
    canReconnect: false,
    indicatorLabel: "준비 중",
    indicatorTone: "pending",
    showNotice: false,
  };
}

function canReactivateRoomError(error: ChatRoomSessionError | null): boolean {
  if (!error) {
    return false;
  }

  switch (error.code) {
    case "SUBSCRIPTION_SETUP_FAILED":
    case "WORKER_UNAVAILABLE":
      return true;
    case "SUBSCRIPTION_REJECTED":
    case "SUBSCRIPTION_SYNC_REJECTED":
      return error.retryable === true || error.serverCode === "ROOM_AUTHORIZATION_UNAVAILABLE";
    case "INVALID_ROOM_ID":
    case "ROOM_CLOSED":
      return false;
  }
}
