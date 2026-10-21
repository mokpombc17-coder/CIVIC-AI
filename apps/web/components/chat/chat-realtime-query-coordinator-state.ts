import type { ApplyChatRealtimeDeliveryResult } from "@/lib/chat/realtime/chat-realtime-query-coordinator";
import type { ChatRoomReadReceiptSyncStatus } from "@/lib/chat/realtime/chat-room-read-receipt-coordinator";

export type ChatRealtimeQueryCoordinatorViewState = Readonly<{
  error: Error | null;
  isRecovering: boolean;
  isSynchronized: boolean;
  lastApplied: ApplyChatRealtimeDeliveryResult | null;
  readReceiptError: Error | null;
  readReceiptStatus: ChatRoomReadReceiptSyncStatus;
}>;

export type ChatRealtimeQueryCoordinatorStateEvent =
  | Readonly<{ type: "coordinatorStarted" }>
  | Readonly<{ cause: unknown; type: "coordinatorFailed" }>
  | Readonly<{ result: ApplyChatRealtimeDeliveryResult; type: "deliveryApplied" }>
  | Readonly<{ type: "recoveryStarted" }>
  | Readonly<{ type: "recoveryCompleted" }>
  | Readonly<{ type: "synchronized" }>
  | Readonly<{ cause: unknown; type: "readReceiptFailed" }>
  | Readonly<{
      error: unknown | null;
      status: ChatRoomReadReceiptSyncStatus;
      type: "readReceiptStateChanged";
    }>
  | Readonly<{ type: "retryRequested" }>;

export const initialChatRealtimeQueryCoordinatorState: ChatRealtimeQueryCoordinatorViewState = {
  error: null,
  isRecovering: false,
  isSynchronized: false,
  lastApplied: null,
  readReceiptError: null,
  readReceiptStatus: "idle",
};

export function reduceChatRealtimeQueryCoordinatorState(
  state: ChatRealtimeQueryCoordinatorViewState,
  event: ChatRealtimeQueryCoordinatorStateEvent,
): ChatRealtimeQueryCoordinatorViewState {
  switch (event.type) {
    case "coordinatorStarted":
      return initialChatRealtimeQueryCoordinatorState;
    case "coordinatorFailed":
      return {
        ...state,
        error: toCoordinatorError(event.cause),
        isRecovering: false,
        isSynchronized: false,
      };
    case "deliveryApplied":
      return {
        ...state,
        error: null,
        isRecovering: false,
        isSynchronized: true,
        lastApplied: event.result,
      };
    case "recoveryStarted":
      return {
        ...state,
        error: null,
        isRecovering: true,
        isSynchronized: false,
      };
    case "recoveryCompleted":
      return {
        ...state,
        error: null,
        isRecovering: false,
      };
    case "synchronized":
      return {
        ...state,
        error: null,
        isRecovering: false,
        isSynchronized: true,
      };
    case "readReceiptFailed":
      return {
        ...state,
        readReceiptError: toCoordinatorError(event.cause),
      };
    case "readReceiptStateChanged":
      return {
        ...state,
        readReceiptError: event.error === null ? null : toCoordinatorError(event.error),
        readReceiptStatus: event.status,
      };
    case "retryRequested":
      return {
        ...state,
        error: null,
        readReceiptError: null,
      };
  }
}

function toCoordinatorError(cause: unknown): Error {
  return cause instanceof Error
    ? cause
    : new Error("실시간 채팅 cache 병합 중 알 수 없는 오류가 발생했습니다.");
}
