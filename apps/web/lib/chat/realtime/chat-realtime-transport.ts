import type { ChatRealtimeEventDelivery } from "./chat-realtime-event-buffer";
import type { ChatMessageDeliveryLifecycleEvent } from "./chat-message-delivery-scheduler";
import type { ChatMessageMutationLifecycleEvent } from "./chat-message-mutation-scheduler";
import type {
  ChatMessageCommandResult,
  ChatMessageDeleteRequest,
  ChatMessageEditRequest,
  ChatMessageMutationCommandResult,
  ChatMessageSendRequest,
  ChatRoomInboxEvent,
} from "./chat-stomp-contracts";

export type ChatConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnecting"
  | "disconnected"
  | "replaced"
  | "authentication-required"
  | "error";

export type ChatRealtimeError = Readonly<{
  source: "stomp" | "websocket" | "worker";
  code?: "AUTHENTICATION_REQUIRED" | "CONNECTION_REPLACED" | "ROOM_ACCESS_REVOKED" | "ROOM_CLOSED";
  message: string;
}>;

export const CHAT_CONNECTION_REPLACED_CLOSE_CODE = 4001;
export const CHAT_CONNECTION_REPLACED_REASON = "CONNECTION_REPLACED";
export const CHAT_CONNECTION_REPLACED_MESSAGE =
  "다른 브라우저, 프로필 또는 기기에서 채팅에 연결하여 이 연결이 종료되었습니다.";
export const CHAT_AUTHENTICATION_REQUIRED_MESSAGE =
  "채팅 연결 인증이 만료되었거나 유효하지 않습니다. 다시 로그인해 주세요.";
export const CHAT_ROOM_ACCESS_REVOKED_CLOSE_CODE = 4002;
export const CHAT_ROOM_ACCESS_REVOKED_REASON = "ROOM_ACCESS_REVOKED";
export const CHAT_ROOM_ACCESS_REVOKED_MESSAGE =
  "채팅방 접근 상태가 변경되어 연결을 새로 만들고 방 상태를 다시 확인하고 있습니다.";
export const CHAT_ROOM_CLOSED_CLOSE_CODE = 4003;
export const CHAT_ROOM_CLOSED_REASON = "ROOM_CLOSED";
export const CHAT_ROOM_CLOSED_MESSAGE = "채팅방이 종료되어 실시간 연결이 해제되었습니다.";

export function isChatConnectionReplacedCloseEvent(event: Pick<CloseEvent, "code">): boolean {
  return event.code === CHAT_CONNECTION_REPLACED_CLOSE_CODE;
}

export function isChatRoomAccessRevokedCloseEvent(event: Pick<CloseEvent, "code">): boolean {
  return event.code === CHAT_ROOM_ACCESS_REVOKED_CLOSE_CODE;
}

export function isChatRoomClosedCloseEvent(event: Pick<CloseEvent, "code">): boolean {
  return event.code === CHAT_ROOM_CLOSED_CLOSE_CODE;
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
    | "ROOM_CLOSED"
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

export type ChatRoomMessageEditCommand = Readonly<{
  request: ChatMessageEditRequest;
  roomId: string;
}>;

export type ChatRoomMessageDeleteCommand = Readonly<{
  request: ChatMessageDeleteRequest;
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

export type ChatMessageMutationFailureCode =
  "CONNECTION_NOT_READY" | "ROOM_NOT_ACTIVE" | "MUTATION_PUBLISH_FAILED";

export type ChatMessageMutationEvent =
  | Readonly<{
      kind: "result";
      result: ChatMessageMutationCommandResult;
      roomId: string;
    }>
  | Readonly<{
      kind: "failure";
      clientMutationId: string;
      code: ChatMessageMutationFailureCode;
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

export class ChatMessageMutationError extends Error {
  override readonly name = "ChatMessageMutationError";

  constructor(
    readonly code: ChatMessageMutationFailureCode,
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
  deleteRoomMessage(command: ChatRoomMessageDeleteCommand): void;
  editRoomMessage(command: ChatRoomMessageEditCommand): void;
  getRealtimeEventDelivery(): ChatRealtimeEventDelivery | null;
  getRoomSnapshot(): ChatRoomSessionSnapshot;
  getSnapshot(): ChatConnectionSnapshot;
  markRoomSnapshotApplied(roomId: string, generation: number): void;
  observeMessageCommandEvent(listener: (event: ChatMessageCommandEvent) => void): () => void;
  observeMessageDeliveryLifecycle(
    listener: (event: ChatMessageDeliveryLifecycleEvent) => void,
  ): () => void;
  observeMessageMutationLifecycle(
    listener: (event: ChatMessageMutationLifecycleEvent) => void,
  ): () => void;
  observeMessageMutationEvent(listener: (event: ChatMessageMutationEvent) => void): () => void;
  observeRealtimeEventDelivery(listener: () => void): () => void;
  observeRoomInboxEvent(listener: (event: ChatRoomInboxEvent) => void): () => void;
  observeRoom(listener: () => void): () => void;
  observe(listener: () => void): () => void;
  reconnect(): void;
  releaseRoom(roomId: string): void;
  sendRoomMessage(command: ChatRoomMessageSendCommand): void;
};

export type ChatRealtimeTransportFactory = () => ChatRealtimeTransport;
