import type { Client, IMessage } from "@stomp/stompjs";
import { createChatStompClient } from "../chat-stomp-client";
import {
  getChatRoomEventsDestination,
  getChatRoomMessagesDestination,
} from "./chat-stomp-destinations";
import { parseChatSubscriptionRejection } from "./chat-stomp-contracts";
import { ChatStompSubscriptionManager } from "./chat-stomp-subscription-manager";
import {
  CHAT_CONNECTION_REPLACED_MESSAGE,
  isChatConnectionReplacedCloseEvent,
  type ChatConnectionSnapshot,
  type ChatConnectionStatus,
  type ChatRealtimeError,
  type ChatRealtimeTransport,
  type ChatRoomSessionSnapshot,
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
  | "subscribe"
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
  private readonly subscriptions: ChatStompSubscriptionManager;

  constructor(private readonly client: DirectStompClient = createChatStompClient()) {
    this.subscriptions = new ChatStompSubscriptionManager(this.client, {
      onSystemEvent: this.handleSystemEvent,
    });
    this.client.onConnect = () => {
      if (this.attachmentCount === 0) {
        return;
      }

      try {
        this.subscriptions.connect();
      } catch (cause) {
        this.handleSubscriptionSetupFailure(cause);
        return;
      }

      this.setSnapshot("connected", null);

      if (this.roomSnapshot.status === "claiming" && this.roomSnapshot.roomId) {
        this.setRoomSnapshot({
          ...this.roomSnapshot,
          status: "active",
        });
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
      this.subscriptions.disconnect();

      if (isChatConnectionReplacedCloseEvent(event)) {
        this.stopConnectionReplacedReconnect();
        return;
      }

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

    const claimingSnapshot: ChatRoomSessionSnapshot = {
      status: "claiming",
      roomId,
      generation: this.roomSnapshot.generation + 1,
      replacedByRoomId: null,
      error: null,
    };
    this.setRoomSnapshot(claimingSnapshot);

    try {
      this.subscriptions.activateRoom(roomId);
    } catch (cause) {
      this.handleSubscriptionSetupFailure(cause);
      return;
    }

    if (this.subscriptions.connected) {
      if (this.snapshot.status === "error") {
        this.setSnapshot("connected", null);
      }
      this.setRoomSnapshot({
        ...claimingSnapshot,
        status: "active",
      });
    }
  };

  readonly releaseRoom = (roomId: string): void => {
    if (this.roomSnapshot.roomId !== roomId) {
      return;
    }

    try {
      this.subscriptions.releaseRoom(roomId);
    } catch (cause) {
      this.setSnapshot("error", {
        source: "stomp",
        message: getSubscriptionErrorMessage(cause, "기존 채팅방 STOMP 구독 해제에 실패했습니다."),
      });
    } finally {
      this.setRoomSnapshot({
        ...INITIAL_ROOM_SNAPSHOT,
        generation: this.roomSnapshot.generation + 1,
      });
    }
  };

  readonly reconnect = (): void => {
    if (this.attachmentCount === 0 || this.snapshot.status === "replaced") {
      return;
    }

    if (this.client.active) {
      this.subscriptions.disconnect();
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

    if (this.roomSnapshot.roomId) {
      try {
        this.subscriptions.releaseRoom(this.roomSnapshot.roomId);
      } catch {
        // The connection is being closed, so no room subscription can survive this detach.
      }
    }

    this.subscriptions.disconnect();
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

  private stopConnectionReplacedReconnect(): void {
    try {
      void this.client.deactivate().catch(() => {
        // deactivate flips Client.active synchronously, so a rejected cleanup must not restart it.
      });
    } catch {
      // Keep the terminal replacement state even if the STOMP cleanup itself throws.
    }

    this.setSnapshot("replaced", {
      source: "websocket",
      code: "CONNECTION_REPLACED",
      message: CHAT_CONNECTION_REPLACED_MESSAGE,
    });
  }

  private setRoomSnapshot(snapshot: ChatRoomSessionSnapshot): void {
    this.roomSnapshot = snapshot;
    this.roomListeners.forEach((listener) => listener());
  }

  private handleSubscriptionSetupFailure(cause: unknown): void {
    const message = getSubscriptionErrorMessage(cause, "채팅 STOMP 구독을 설정하지 못했습니다.");
    const roomId = this.roomSnapshot.roomId;

    if (roomId) {
      try {
        this.subscriptions.releaseRoom(roomId);
      } catch {
        // Preserve the original subscription setup error.
      }
      this.setRoomSnapshot({
        status: "error",
        roomId,
        generation: this.roomSnapshot.generation,
        replacedByRoomId: null,
        error: {
          code: "SUBSCRIPTION_SETUP_FAILED",
          message,
        },
      });
    }

    this.setSnapshot("error", {
      source: "stomp",
      message,
    });
  }

  private readonly handleSystemEvent = (message: IMessage): void => {
    const rejection = parseChatSubscriptionRejection(message.body);
    const roomId = this.roomSnapshot.roomId;

    if (
      !rejection ||
      !roomId ||
      (rejection.destination !== getChatRoomMessagesDestination(roomId) &&
        rejection.destination !== getChatRoomEventsDestination(roomId))
    ) {
      return;
    }

    try {
      this.subscriptions.releaseRoom(roomId);
    } catch {
      // The server already rejected the room subscription; keep the rejection as the UI error.
    }
    this.setRoomSnapshot({
      status: "error",
      roomId,
      generation: this.roomSnapshot.generation + 1,
      replacedByRoomId: null,
      error: {
        code: "SUBSCRIPTION_REJECTED",
        serverCode: rejection.code,
        message: `서버가 ${rejection.destination} 구독을 거절했습니다.`,
      },
    });
  };
}

function getSubscriptionErrorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message.trim() ? cause.message : fallback;
}
