import type { Client } from "@stomp/stompjs";
import { createChatStompClient } from "../chat-stomp-client";
import type {
  ChatConnectionSnapshot,
  ChatConnectionStatus,
  ChatRealtimeError,
  ChatRealtimeTransport,
} from "./chat-realtime-transport";

export type DirectStompClient = Pick<
  Client,
  | "active"
  | "activate"
  | "deactivate"
  | "forceDisconnect"
  | "onConnect"
  | "onStompError"
  | "onWebSocketClose"
  | "onWebSocketError"
>;

const INITIAL_SNAPSHOT: ChatConnectionSnapshot = {
  status: "idle",
  error: null,
};

export class DirectStompTransport implements ChatRealtimeTransport {
  private attachmentCount = 0;
  private readonly listeners = new Set<() => void>();
  private snapshot: ChatConnectionSnapshot = INITIAL_SNAPSHOT;

  constructor(private readonly client: DirectStompClient = createChatStompClient()) {
    this.client.onConnect = () => {
      if (this.attachmentCount > 0) {
        this.setSnapshot("connected", null);
      }
    };
    this.client.onStompError = (frame) => {
      this.setSnapshot("error", {
        source: "stomp",
        message:
          frame.headers.message?.trim() ||
          frame.body.trim() ||
          "STOMP 서버가 연결 오류를 반환했습니다.",
      });
    };
    this.client.onWebSocketError = () => {
      this.setSnapshot("error", {
        source: "websocket",
        message: "WebSocket 연결 중 오류가 발생했습니다.",
      });
    };
    this.client.onWebSocketClose = (event) => {
      if (this.attachmentCount === 0 || !this.client.active) {
        this.setSnapshot("disconnected", null);
        return;
      }

      const error = event.reason.trim()
        ? {
            source: "websocket" as const,
            message: event.reason,
          }
        : this.snapshot.error;

      this.setSnapshot("reconnecting", error);
    };
  }

  attach(): () => void {
    this.attachmentCount += 1;

    if (this.attachmentCount === 1) {
      this.setSnapshot("connecting", null);
      this.client.activate();
    }

    let attached = true;

    return () => {
      if (!attached) {
        return;
      }

      attached = false;
      this.detach();
    };
  }

  readonly getSnapshot = (): ChatConnectionSnapshot => this.snapshot;

  readonly observe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly reconnect = (): void => {
    if (this.attachmentCount === 0) {
      return;
    }

    if (this.client.active) {
      this.setSnapshot("reconnecting", null);
      this.client.forceDisconnect();
      return;
    }

    this.setSnapshot("connecting", null);
    this.client.activate();
  };

  private detach(): void {
    this.attachmentCount -= 1;

    if (this.attachmentCount > 0) {
      return;
    }

    this.setSnapshot("disconnecting", null);

    void this.client.deactivate().then(() => {
      if (this.attachmentCount === 0) {
        this.setSnapshot("disconnected", null);
      }
    });
  }

  private setSnapshot(status: ChatConnectionStatus, error: ChatRealtimeError | null): void {
    this.snapshot = { status, error };
    this.listeners.forEach((listener) => listener());
  }
}
