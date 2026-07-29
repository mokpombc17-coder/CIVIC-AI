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

export type ChatRealtimeTransport = {
  attach(): () => void;
  getSnapshot(): ChatConnectionSnapshot;
  observe(listener: () => void): () => void;
  reconnect(): void;
};

export type ChatRealtimeTransportFactory = () => ChatRealtimeTransport;
