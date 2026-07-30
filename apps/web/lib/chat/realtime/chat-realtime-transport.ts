import type { ChatRealtimeEventDelivery } from "./chat-realtime-event-buffer";

export type ChatConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnecting"
  | "disconnected"
  | "replaced"
  | "error";

export type ChatRealtimeError = Readonly<{
  source: "stomp" | "websocket" | "worker";
  code?: "CONNECTION_REPLACED";
  message: string;
}>;

export const CHAT_CONNECTION_REPLACED_CLOSE_CODE = 4001;
export const CHAT_CONNECTION_REPLACED_REASON = "CONNECTION_REPLACED";
export const CHAT_CONNECTION_REPLACED_MESSAGE =
  "다른 브라우저, 프로필 또는 기기에서 채팅에 연결하여 이 연결이 종료되었습니다.";

export function isChatConnectionReplacedCloseEvent(event: Pick<CloseEvent, "code">): boolean {
  return event.code === CHAT_CONNECTION_REPLACED_CLOSE_CODE;
}

export type ChatConnectionSnapshot = Readonly<{
  status: ChatConnectionStatus;
  error: ChatRealtimeError | null;
}>;

export type ChatRoomSessionStatus =
  "idle" | "claiming" | "active" | "replaced" | "releasing" | "error";

export type ChatRoomSessionError = Readonly<{
  code:
    | "INVALID_ROOM_ID"
    | "SUBSCRIPTION_SETUP_FAILED"
    | "SUBSCRIPTION_REJECTED"
    | "SUBSCRIPTION_SYNC_REJECTED"
    | "WORKER_UNAVAILABLE";
  message: string;
  retryable?: boolean;
  serverCode?: string;
}>;

export type ChatRoomSessionSnapshot = Readonly<{
  status: ChatRoomSessionStatus;
  roomId: string | null;
  generation: number;
  replacedByRoomId: string | null;
  watermarkSequence: number | null;
  error: ChatRoomSessionError | null;
}>;

export type ChatRealtimeTransport = {
  acknowledgeRealtimeEventDelivery(deliveryId: string): void;
  attach(): () => void;
  claimRoom(roomId: string): void;
  getRealtimeEventDelivery(): ChatRealtimeEventDelivery | null;
  getRoomSnapshot(): ChatRoomSessionSnapshot;
  getSnapshot(): ChatConnectionSnapshot;
  markRoomSnapshotApplied(roomId: string, generation: number): void;
  observeRealtimeEventDelivery(listener: () => void): () => void;
  observeRoom(listener: () => void): () => void;
  observe(listener: () => void): () => void;
  reconnect(): void;
  releaseRoom(roomId: string): void;
};

export type ChatRealtimeTransportFactory = () => ChatRealtimeTransport;
