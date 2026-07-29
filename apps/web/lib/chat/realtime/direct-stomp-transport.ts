import type { Client } from "@stomp/stompjs";
import { createChatStompClient } from "../chat-stomp-client";
import type {
  ChatConnectionSnapshot,
  ChatConnectionStatus,
  ChatRealtimeError,
  ChatRealtimeTransport,
  ChatRoomSessionSnapshot,
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

const INITIAL_ROOM_SNAPSHOT: ChatRoomSessionSnapshot = {
  status: "idle",
  roomId: null,
  generation: 0,
  replacedByRoomId: null,
  error: null,
};

const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export class DirectStompTransport implements ChatRealtimeTransport {
  private attachmentCount = 0;
  private readonly listeners = new Set<() => void>();
  private readonly roomListeners = new Set<() => void>();
  private roomSnapshot: ChatRoomSessionSnapshot = INITIAL_ROOM_SNAPSHOT;
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

  readonly getRoomSnapshot = (): ChatRoomSessionSnapshot => this.roomSnapshot;

  readonly observe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly observeRoom = (listener: () => void): (() => void) => {
    this.roomListeners.add(listener);

    return () => {
      this.roomListeners.delete(listener);
    };
  };

  readonly claimRoom = (roomId: string): void => {
    if (!ROOM_ID_PATTERN.test(roomId)) {
      this.setRoomSnapshot({
        status: "error",
        roomId,
        generation: this.roomSnapshot.generation,
        replacedByRoomId: null,
        error: {
          code: "INVALID_ROOM_ID",
          message: "roomId는 영문자, 숫자, _, -로 구성된 1~64자 문자열이어야 합니다.",
        },
      });
      return;
    }

    if (this.roomSnapshot.status === "active" && this.roomSnapshot.roomId === roomId) {
      return;
    }

    this.setRoomSnapshot({
      status: "active",
      roomId,
      generation: this.roomSnapshot.generation + 1,
      replacedByRoomId: null,
      error: null,
    });
  };

  readonly releaseRoom = (roomId: string): void => {
    if (this.roomSnapshot.roomId !== roomId) {
      return;
    }

    this.setRoomSnapshot({
      ...INITIAL_ROOM_SNAPSHOT,
      generation: this.roomSnapshot.generation + 1,
    });
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

    if (this.roomSnapshot.status !== "idle") {
      this.setRoomSnapshot({
        ...INITIAL_ROOM_SNAPSHOT,
        generation: this.roomSnapshot.generation + 1,
      });
    }
  }

  private setSnapshot(status: ChatConnectionStatus, error: ChatRealtimeError | null): void {
    this.snapshot = { status, error };
    this.listeners.forEach((listener) => listener());
  }

  private setRoomSnapshot(snapshot: ChatRoomSessionSnapshot): void {
    this.roomSnapshot = snapshot;
    this.roomListeners.forEach((listener) => listener());
  }
}
