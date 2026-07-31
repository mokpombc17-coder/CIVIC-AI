import type { ChatRealtimeBufferedEvent } from "./chat-realtime-event-buffer";
import {
  isChatMessageDeliveryLifecycleEvent,
  type ChatMessageDeliveryLifecycleEvent,
} from "./chat-message-delivery-scheduler";
import {
  isChatMessageMutationLifecycleEvent,
  type ChatMessageMutationLifecycleEvent,
} from "./chat-message-mutation-scheduler";
import type {
  ChatConnectionSnapshot,
  ChatMessageMutationFailureCode,
  ChatMessageSendFailureCode,
} from "./chat-realtime-transport";
import {
  chatMessageCommandResultSchema,
  chatMessageCreatedEventSchema,
  chatMessageDeleteRequestSchema,
  chatMessageEditRequestSchema,
  chatMessageMutationCommandResultSchema,
  chatMessageSendRequestSchema,
  chatRoomEventEnvelopeSchema,
  type ChatMessageCommandResult,
  type ChatMessageDeleteRequest,
  type ChatMessageEditRequest,
  type ChatMessageMutationCommandResult,
  type ChatMessageSendRequest,
} from "./chat-stomp-contracts";

export const CHAT_SHARED_WORKER_NAME = "civic-ai-chat-realtime";

export type ChatSharedWorkerCommand =
  | Readonly<{
      type: "ATTACH";
      portId: string;
    }>
  | Readonly<{
      type: "DETACH";
      portId: string;
    }>
  | Readonly<{
      type: "RECONNECT";
      portId: string;
    }>
  | Readonly<{
      type: "CLAIM_ROOM";
      portId: string;
      requestId: string;
      roomId: string;
    }>
  | Readonly<{
      type: "RELEASE_ROOM";
      portId: string;
      requestId: string;
      roomId: string;
    }>
  | Readonly<{
      type: "SEND_ROOM_MESSAGE";
      portId: string;
      roomId: string;
      request: ChatMessageSendRequest;
    }>
  | Readonly<{
      type: "EDIT_ROOM_MESSAGE";
      portId: string;
      roomId: string;
      request: ChatMessageEditRequest;
    }>
  | Readonly<{
      type: "DELETE_ROOM_MESSAGE";
      portId: string;
      roomId: string;
      request: ChatMessageDeleteRequest;
    }>
  | Readonly<{
      type: "ROOM_SNAPSHOT_APPLIED";
      portId: string;
      roomId: string;
      generation: number;
    }>
  | Readonly<{
      type: "ROOM_EVENTS_APPLIED";
      portId: string;
      deliveryId: string;
      roomId: string;
      generation: number;
    }>;

export type ChatSharedWorkerEvent =
  | Readonly<{
      type: "CONNECTION_SNAPSHOT";
      workerInstanceId: string;
      attachedPortCount: number;
      snapshot: ChatConnectionSnapshot;
    }>
  | Readonly<{
      type: "ROOM_SYNCING";
      roomId: string;
      generation: number;
    }>
  | Readonly<{
      type: "ROOM_ACTIVATED";
      requestId: string;
      roomId: string;
      generation: number;
      messageVisibleAfterSequence: number;
      watermarkSequence: number;
    }>
  | Readonly<{
      type: "ROOM_REPLACED";
      roomId: string;
      activatedRoomId: string;
      generation: number;
    }>
  | Readonly<{
      type: "ROOM_RELEASED";
      requestId: string;
      roomId: string;
      generation: number;
    }>
  | Readonly<{
      type: "ROOM_ACTIVATION_FAILED";
      requestId: string;
      roomId: string;
      code: "INVALID_ROOM_ID" | "SUBSCRIPTION_SETUP_FAILED";
      message: string;
    }>
  | Readonly<{
      type: "ROOM_SUBSCRIPTION_FAILED";
      roomId: string;
      generation: number;
      code: string;
      message: string;
    }>
  | Readonly<{
      type: "ROOM_SYNC_FAILED";
      requestId: string;
      roomId: string;
      generation: number;
      code: string;
      retryable: boolean;
      message: string;
    }>
  | Readonly<{
      type: "ROOM_MESSAGE_COMMAND_RESULT";
      roomId: string;
      result: ChatMessageCommandResult;
    }>
  | Readonly<{
      type: "ROOM_MESSAGE_SEND_FAILED";
      roomId: string;
      clientMessageId: string;
      code: ChatMessageSendFailureCode;
      retryable: boolean;
      message: string;
    }>
  | Readonly<{
      type: "ROOM_MESSAGE_MUTATION_RESULT";
      roomId: string;
      result: ChatMessageMutationCommandResult;
    }>
  | Readonly<{
      type: "ROOM_MESSAGE_MUTATION_FAILED";
      roomId: string;
      clientMutationId: string;
      code: ChatMessageMutationFailureCode;
      retryable: boolean;
      message: string;
    }>
  | Readonly<{
      type: "ROOM_MESSAGE_DELIVERY_LIFECYCLE";
      event: ChatMessageDeliveryLifecycleEvent;
    }>
  | Readonly<{
      type: "ROOM_MESSAGE_MUTATION_LIFECYCLE";
      event: ChatMessageMutationLifecycleEvent;
    }>
  | Readonly<{
      type: "ROOM_EVENTS_DELIVERED";
      deliveryId: string;
      roomId: string;
      generation: number;
      events: readonly ChatRealtimeBufferedEvent[];
      throughBufferSequence: number;
      overflowed: boolean;
      invalidEventCount: number;
    }>;

const CONNECTION_STATUSES = new Set<ChatConnectionSnapshot["status"]>([
  "idle",
  "connecting",
  "connected",
  "reconnecting",
  "disconnecting",
  "disconnected",
  "replaced",
  "error",
]);

export function isChatSharedWorkerCommand(value: unknown): value is ChatSharedWorkerCommand {
  if (!value || typeof value !== "object") {
    return false;
  }

  const command = value as Partial<ChatSharedWorkerCommand>;

  if (typeof command.portId !== "string" || command.portId.length === 0) {
    return false;
  }

  if (command.type === "ATTACH" || command.type === "DETACH" || command.type === "RECONNECT") {
    return true;
  }

  if (command.type === "ROOM_SNAPSHOT_APPLIED") {
    return typeof command.roomId === "string" && isGeneration(command.generation);
  }

  if (command.type === "ROOM_EVENTS_APPLIED") {
    return (
      typeof command.deliveryId === "string" &&
      command.deliveryId.length > 0 &&
      typeof command.roomId === "string" &&
      isGeneration(command.generation)
    );
  }

  if (command.type === "SEND_ROOM_MESSAGE") {
    return (
      typeof command.roomId === "string" &&
      chatMessageSendRequestSchema.safeParse(command.request).success
    );
  }

  if (command.type === "EDIT_ROOM_MESSAGE") {
    return (
      typeof command.roomId === "string" &&
      chatMessageEditRequestSchema.safeParse(command.request).success
    );
  }

  if (command.type === "DELETE_ROOM_MESSAGE") {
    return (
      typeof command.roomId === "string" &&
      chatMessageDeleteRequestSchema.safeParse(command.request).success
    );
  }

  return (
    (command.type === "CLAIM_ROOM" || command.type === "RELEASE_ROOM") &&
    typeof command.requestId === "string" &&
    command.requestId.length > 0 &&
    typeof command.roomId === "string"
  );
}

export function isChatSharedWorkerEvent(value: unknown): value is ChatSharedWorkerEvent {
  if (!value || typeof value !== "object") {
    return false;
  }

  const event = value as Record<string, unknown>;

  if (event.type === "CONNECTION_SNAPSHOT") {
    const snapshot = event.snapshot as Partial<ChatConnectionSnapshot> | undefined;

    return (
      typeof event.workerInstanceId === "string" &&
      typeof event.attachedPortCount === "number" &&
      event.attachedPortCount >= 0 &&
      !!snapshot &&
      typeof snapshot.status === "string" &&
      CONNECTION_STATUSES.has(snapshot.status as ChatConnectionSnapshot["status"]) &&
      (snapshot.error === null ||
        (!!snapshot.error &&
          (snapshot.error.source === "stomp" ||
            snapshot.error.source === "websocket" ||
            snapshot.error.source === "worker") &&
          (snapshot.error.code === undefined ||
            snapshot.error.code === "CONNECTION_REPLACED" ||
            snapshot.error.code === "ROOM_ACCESS_REVOKED" ||
            snapshot.error.code === "ROOM_CLOSED") &&
          typeof snapshot.error.message === "string"))
    );
  }

  if (event.type === "ROOM_REPLACED") {
    return (
      typeof event.roomId === "string" &&
      typeof event.activatedRoomId === "string" &&
      isGeneration(event.generation)
    );
  }

  if (event.type === "ROOM_SYNCING") {
    return typeof event.roomId === "string" && isGeneration(event.generation);
  }

  if (event.type === "ROOM_SUBSCRIPTION_FAILED") {
    return (
      typeof event.roomId === "string" &&
      isGeneration(event.generation) &&
      typeof event.code === "string" &&
      event.code.length > 0 &&
      typeof event.message === "string"
    );
  }

  if (event.type === "ROOM_SYNC_FAILED") {
    return (
      typeof event.requestId === "string" &&
      event.requestId.length > 0 &&
      typeof event.roomId === "string" &&
      isGeneration(event.generation) &&
      typeof event.code === "string" &&
      event.code.length > 0 &&
      typeof event.retryable === "boolean" &&
      typeof event.message === "string"
    );
  }

  if (event.type === "ROOM_MESSAGE_COMMAND_RESULT") {
    return (
      typeof event.roomId === "string" &&
      chatMessageCommandResultSchema.safeParse(event.result).success
    );
  }

  if (event.type === "ROOM_MESSAGE_SEND_FAILED") {
    return (
      typeof event.roomId === "string" &&
      typeof event.clientMessageId === "string" &&
      event.clientMessageId.length > 0 &&
      (event.code === "CONNECTION_NOT_READY" ||
        event.code === "ROOM_NOT_ACTIVE" ||
        event.code === "MESSAGE_PUBLISH_FAILED") &&
      typeof event.retryable === "boolean" &&
      typeof event.message === "string"
    );
  }

  if (event.type === "ROOM_MESSAGE_MUTATION_RESULT") {
    return (
      typeof event.roomId === "string" &&
      chatMessageMutationCommandResultSchema.safeParse(event.result).success
    );
  }

  if (event.type === "ROOM_MESSAGE_MUTATION_FAILED") {
    return (
      typeof event.roomId === "string" &&
      typeof event.clientMutationId === "string" &&
      event.clientMutationId.length > 0 &&
      (event.code === "CONNECTION_NOT_READY" ||
        event.code === "ROOM_NOT_ACTIVE" ||
        event.code === "MUTATION_PUBLISH_FAILED") &&
      typeof event.retryable === "boolean" &&
      typeof event.message === "string"
    );
  }

  if (event.type === "ROOM_MESSAGE_DELIVERY_LIFECYCLE") {
    return isChatMessageDeliveryLifecycleEvent(event.event);
  }

  if (event.type === "ROOM_MESSAGE_MUTATION_LIFECYCLE") {
    return isChatMessageMutationLifecycleEvent(event.event);
  }

  if (event.type === "ROOM_EVENTS_DELIVERED") {
    const throughBufferSequence = event.throughBufferSequence;

    return (
      typeof event.deliveryId === "string" &&
      event.deliveryId.length > 0 &&
      typeof event.roomId === "string" &&
      isGeneration(event.generation) &&
      Array.isArray(event.events) &&
      isGeneration(throughBufferSequence) &&
      event.events.every(isChatRealtimeBufferedEvent) &&
      hasStrictlyIncreasingBufferSequences(event.events) &&
      event.events.every(
        (bufferedEvent) =>
          bufferedEvent.bufferSequence <= throughBufferSequence &&
          bufferedEvent.event.payload.roomId === event.roomId,
      ) &&
      typeof event.overflowed === "boolean" &&
      isGeneration(event.invalidEventCount)
    );
  }

  if (
    event.type === "ROOM_ACTIVATED" ||
    event.type === "ROOM_RELEASED" ||
    event.type === "ROOM_ACTIVATION_FAILED"
  ) {
    const hasRequestFields =
      typeof event.requestId === "string" &&
      event.requestId.length > 0 &&
      typeof event.roomId === "string";

    if (event.type === "ROOM_ACTIVATION_FAILED") {
      return (
        hasRequestFields &&
        (event.code === "INVALID_ROOM_ID" || event.code === "SUBSCRIPTION_SETUP_FAILED") &&
        typeof event.message === "string"
      );
    }

    return (
      hasRequestFields &&
      isGeneration(event.generation) &&
      (event.type !== "ROOM_ACTIVATED" ||
        (isGeneration(event.messageVisibleAfterSequence) && isGeneration(event.watermarkSequence)))
    );
  }

  return false;
}

function isGeneration(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isChatRealtimeBufferedEvent(value: unknown): value is ChatRealtimeBufferedEvent {
  if (!value || typeof value !== "object") {
    return false;
  }

  const event = value as Partial<ChatRealtimeBufferedEvent>;

  if (!Number.isSafeInteger(event.bufferSequence) || (event.bufferSequence ?? 0) < 1) {
    return false;
  }

  return event.kind === "message"
    ? chatMessageCreatedEventSchema.safeParse(event.event).success
    : event.kind === "room" && chatRoomEventEnvelopeSchema.safeParse(event.event).success;
}

function hasStrictlyIncreasingBufferSequences(
  events: readonly ChatRealtimeBufferedEvent[],
): boolean {
  return events.every(
    (event, index) => index === 0 || events[index - 1]!.bufferSequence < event.bufferSequence,
  );
}
