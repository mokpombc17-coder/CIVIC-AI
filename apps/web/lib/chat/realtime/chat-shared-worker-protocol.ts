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
    }>;

export type ChatSharedWorkerEvent = Readonly<{
  type: "CONNECTION_SNAPSHOT";
  workerInstanceId: string;
  attachedPortCount: number;
  snapshot: ChatConnectionSnapshot;
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

  return (
    (command.type === "ATTACH" || command.type === "DETACH" || command.type === "RECONNECT") &&
    typeof command.portId === "string" &&
    command.portId.length > 0
  );
}

export function isChatSharedWorkerEvent(value: unknown): value is ChatSharedWorkerEvent {
  if (!value || typeof value !== "object") {
    return false;
  }

  const event = value as Partial<ChatSharedWorkerEvent>;
  const snapshot = event.snapshot as Partial<ChatConnectionSnapshot> | undefined;

  return (
    event.type === "CONNECTION_SNAPSHOT" &&
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
