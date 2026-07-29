export type ChatConnectionStatus =
  "idle" | "connecting" | "connected" | "reconnecting" | "disconnecting" | "disconnected" | "error";

export type ChatRealtimeError = Readonly<{
  source: "stomp" | "websocket" | "worker";
  message: string;
}>;

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
    | "WORKER_UNAVAILABLE";
  message: string;
  serverCode?: string;
}>;

export type ChatRoomSessionSnapshot = Readonly<{
  status: ChatRoomSessionStatus;
  roomId: string | null;
  generation: number;
  replacedByRoomId: string | null;
  error: ChatRoomSessionError | null;
}>;

export type ChatRealtimeTransport = {
  attach(): () => void;
  claimRoom(roomId: string): void;
  getRoomSnapshot(): ChatRoomSessionSnapshot;
  getSnapshot(): ChatConnectionSnapshot;
  observeRoom(listener: () => void): () => void;
  observe(listener: () => void): () => void;
  reconnect(): void;
  releaseRoom(roomId: string): void;
};

export type ChatRealtimeTransportFactory = () => ChatRealtimeTransport;
