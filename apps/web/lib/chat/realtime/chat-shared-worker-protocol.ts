import type { ChatConnectionSnapshot } from "./chat-realtime-transport";

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
    }>;

export type ChatSharedWorkerEvent =
  | Readonly<{
      type: "CONNECTION_SNAPSHOT";
      workerInstanceId: string;
      attachedPortCount: number;
      snapshot: ChatConnectionSnapshot;
    }>
  | Readonly<{
      type: "ROOM_ACTIVATED";
      requestId: string;
      roomId: string;
      generation: number;
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
      code: "INVALID_ROOM_ID";
      message: string;
    }>;

const CONNECTION_STATUSES = new Set<ChatConnectionSnapshot["status"]>([
  "idle",
  "connecting",
  "connected",
  "reconnecting",
  "disconnecting",
  "disconnected",
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
        hasRequestFields && event.code === "INVALID_ROOM_ID" && typeof event.message === "string"
      );
    }

    return hasRequestFields && isGeneration(event.generation);
  }

  return false;
}

function isGeneration(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
