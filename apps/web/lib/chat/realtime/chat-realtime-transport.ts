import type { ChatRealtimeEventDelivery } from "./chat-realtime-event-buffer";
import type { ChatMessageCommandResult, ChatMessageSendRequest } from "./chat-stomp-contracts";

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
  messageVisibleAfterSequence: number | null;
  watermarkSequence: number | null;
  error: ChatRoomSessionError | null;
}>;

export type ChatRoomMessageSendCommand = Readonly<{
  request: ChatMessageSendRequest;
  roomId: string;
}>;

export type ChatMessageSendFailureCode =
  "CONNECTION_NOT_READY" | "ROOM_NOT_ACTIVE" | "MESSAGE_PUBLISH_FAILED";

export type ChatMessageCommandEvent =
  | Readonly<{
      kind: "result";
      result: ChatMessageCommandResult;
      roomId: string;
    }>
  | Readonly<{
      kind: "failure";
      clientMessageId: string;
      code: ChatMessageSendFailureCode;
      message: string;
      retryable: boolean;
      roomId: string;
    }>;

export class ChatMessageSendError extends Error {
  override readonly name = "ChatMessageSendError";

  constructor(
    readonly code: ChatMessageSendFailureCode,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export type ChatRealtimeTransport = {
  acknowledgeRealtimeEventDelivery(deliveryId: string): void;
  attach(): () => void;
  claimRoom(roomId: string): void;
  getRealtimeEventDelivery(): ChatRealtimeEventDelivery | null;
  getRoomSnapshot(): ChatRoomSessionSnapshot;
  getSnapshot(): ChatConnectionSnapshot;
  markRoomSnapshotApplied(roomId: string, generation: number): void;
  observeMessageCommandEvent(listener: (event: ChatMessageCommandEvent) => void): () => void;
  observeRealtimeEventDelivery(listener: () => void): () => void;
  observeRoom(listener: () => void): () => void;
  observe(listener: () => void): () => void;
  reconnect(): void;
  releaseRoom(roomId: string): void;
  sendRoomMessage(command: ChatRoomMessageSendCommand): void;
};

export type ChatRealtimeTransportFactory = () => ChatRealtimeTransport;
