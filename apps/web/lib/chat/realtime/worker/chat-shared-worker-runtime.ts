import type { Client, IFrame, IMessage } from "@stomp/stompjs";
import {
  CHAT_CONNECTION_REPLACED_MESSAGE,
  isChatConnectionReplacedCloseEvent,
  type ChatConnectionSnapshot,
  type ChatConnectionStatus,
  type ChatRealtimeError,
} from "../chat-realtime-transport";
import {
  getChatRoomEventsDestination,
  getChatRoomMessagesDestination,
} from "../chat-stomp-destinations";
import {
  ChatStompSubscriptionManager,
  parseChatSubscriptionRejection,
} from "../chat-stomp-subscription-manager";
import {
  isChatSharedWorkerCommand,
  type ChatSharedWorkerCommand,
  type ChatSharedWorkerEvent,
} from "../chat-shared-worker-protocol";

export type ChatSharedWorkerStompClient = Pick<
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

type ChatSharedWorkerMessageListener = (event: MessageEvent<unknown>) => void;

export type ChatSharedWorkerPort = {
  addEventListener(type: "message", listener: ChatSharedWorkerMessageListener): void;
  close(): void;
  postMessage(event: ChatSharedWorkerEvent): void;
  removeEventListener(type: "message", listener: ChatSharedWorkerMessageListener): void;
  start(): void;
};

type ConnectedPort = {
  attached: boolean;
  listener: ChatSharedWorkerMessageListener;
  port: ChatSharedWorkerPort;
  portId: string | null;
};

type ActiveRoomLease = Readonly<{
  roomId: string;
  ownerPortId: string;
  generation: number;
}>;

type PendingRoomActivation = Readonly<{
  requestId: string;
  roomId: string;
  ownerPortId: string;
  generation: number;
}>;

const INITIAL_SNAPSHOT: ChatConnectionSnapshot = {
  status: "idle",
  error: null,
};

const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export class ChatSharedWorkerRuntime {
  private activeRoomLease: ActiveRoomLease | null = null;
  private deactivation: Promise<void> | null = null;
  private generation = 0;
  private pendingRoomActivation: PendingRoomActivation | null = null;
  private readonly ports = new Map<ChatSharedWorkerPort, ConnectedPort>();
  private snapshot: ChatConnectionSnapshot = INITIAL_SNAPSHOT;
  private readonly subscriptions: ChatStompSubscriptionManager;

  constructor(
    private readonly client: ChatSharedWorkerStompClient,
    private readonly workerInstanceId = crypto.randomUUID(),
  ) {
    this.subscriptions = new ChatStompSubscriptionManager(this.client, {
      onSystemEvent: this.handleSystemEvent,
    });
    this.client.onConnect = () => {
      this.handleConnected();
    };
    this.client.onStompError = (frame) => {
      if (this.getAttachedPortCount() === 0) {
        return;
      }

      this.setSnapshot("error", {
        source: "stomp",
        message: getStompErrorMessage(frame),
      });
    };
    this.client.onWebSocketError = () => {
      if (this.getAttachedPortCount() > 0) {
        this.setSnapshot("error", {
          source: "websocket",
          message: "WebSocket 연결 중 오류가 발생했습니다.",
        });
      }
    };
    this.client.onWebSocketClose = (event) => {
      this.subscriptions.disconnect();

      if (isChatConnectionReplacedCloseEvent(event)) {
        this.stopConnectionReplacedReconnect();
        return;
      }

      if (this.getAttachedPortCount() === 0 || this.deactivation || !this.client.active) {
        this.snapshot = {
          status: "disconnected",
          error: null,
        };
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

  connectPort(port: ChatSharedWorkerPort): void {
    if (this.ports.has(port)) {
      return;
    }

    const listener = (event: MessageEvent<unknown>) => {
      if (isChatSharedWorkerCommand(event.data)) {
        this.handleCommand(port, event.data);
      }
    };

    this.ports.set(port, {
      attached: false,
      listener,
      port,
      portId: null,
    });
    port.addEventListener("message", listener);
    port.start();
  }

  private handleCommand(port: ChatSharedWorkerPort, command: ChatSharedWorkerCommand): void {
    const connectedPort = this.ports.get(port);

    if (!connectedPort) {
      return;
    }

    switch (command.type) {
      case "ATTACH":
        this.attachPort(connectedPort, command.portId);
        return;
      case "DETACH":
        if (connectedPort.portId === command.portId) {
          this.detachPort(connectedPort);
        }
        return;
      case "RECONNECT":
        if (connectedPort.attached && connectedPort.portId === command.portId) {
          this.reconnect();
        }
        return;
      case "CLAIM_ROOM":
        if (connectedPort.attached && connectedPort.portId === command.portId) {
          this.claimRoom(connectedPort, command);
        }
        return;
      case "RELEASE_ROOM":
        if (connectedPort.attached && connectedPort.portId === command.portId) {
          this.releaseRoom(connectedPort, command);
        }
    }
  }

  private attachPort(connectedPort: ConnectedPort, portId: string): void {
    if (connectedPort.attached) {
      this.sendSnapshot(connectedPort);
      return;
    }

    const hadAttachedPorts = this.getAttachedPortCount() > 0;
    connectedPort.attached = true;
    connectedPort.portId = portId;

    if (hadAttachedPorts) {
      this.broadcastSnapshot();
      return;
    }

    this.startConnection();
  }

  private detachPort(connectedPort: ConnectedPort): void {
    const lease = this.activeRoomLease;

    if (lease && connectedPort.portId === lease.ownerPortId) {
      this.tryReleaseRoom(lease.roomId);
      this.generation += 1;
      this.activeRoomLease = null;
      this.pendingRoomActivation = null;
    }

    connectedPort.attached = false;
    connectedPort.port.removeEventListener("message", connectedPort.listener);
    this.ports.delete(connectedPort.port);
    connectedPort.port.close();

    if (this.getAttachedPortCount() > 0) {
      this.broadcastSnapshot();
      return;
    }

    this.stopConnection();
  }

  private startConnection(): void {
    if (this.deactivation) {
      this.setSnapshot("connecting", null);
      return;
    }

    if (this.client.active) {
      this.broadcastSnapshot();
      return;
    }

    this.setSnapshot("connecting", null);
    this.client.activate();
  }

  private stopConnection(): void {
    if (this.deactivation) {
      return;
    }

    this.snapshot = {
      status: "disconnecting",
      error: null,
    };
    this.subscriptions.disconnect();

    let operation: Promise<void>;

    try {
      operation = this.client.deactivate();
    } catch (cause) {
      this.handleDeactivationFailure(cause);
      return;
    }

    this.deactivation = operation;
    void operation.then(
      () => {
        if (this.deactivation !== operation) {
          return;
        }

        this.deactivation = null;

        if (this.getAttachedPortCount() > 0) {
          this.startConnection();
          return;
        }

        this.snapshot = {
          status: "disconnected",
          error: null,
        };
      },
      (cause: unknown) => {
        if (this.deactivation === operation) {
          this.deactivation = null;
          this.handleDeactivationFailure(cause);
        }
      },
    );
  }

  private handleDeactivationFailure(cause: unknown): void {
    const error = {
      source: "worker" as const,
      message: cause instanceof Error ? cause.message : "STOMP 연결 종료에 실패했습니다.",
    };

    if (this.getAttachedPortCount() > 0) {
      this.setSnapshot("error", error);
      return;
    }

    this.snapshot = {
      status: "error",
      error,
    };
  }

  private reconnect(): void {
    if (this.snapshot.status === "replaced") {
      return;
    }

    if (this.client.active) {
      this.subscriptions.disconnect();
      this.setSnapshot("reconnecting", null);
      this.client.forceDisconnect();
      return;
    }

    this.startConnection();
  }

  private stopConnectionReplacedReconnect(): void {
    this.pendingRoomActivation = null;

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

  private claimRoom(
    connectedPort: ConnectedPort,
    command: Extract<ChatSharedWorkerCommand, { type: "CLAIM_ROOM" }>,
  ): void {
    if (!ROOM_ID_PATTERN.test(command.roomId)) {
      connectedPort.port.postMessage({
        type: "ROOM_ACTIVATION_FAILED",
        requestId: command.requestId,
        roomId: command.roomId,
        code: "INVALID_ROOM_ID",
        message: "roomId는 영문자, 숫자, _, -로 구성된 1~64자 문자열이어야 합니다.",
      });
      return;
    }

    const portId = connectedPort.portId;

    if (!portId) {
      return;
    }

    const previousLease = this.activeRoomLease;

    if (previousLease?.roomId === command.roomId && previousLease.ownerPortId === portId) {
      this.pendingRoomActivation = {
        requestId: command.requestId,
        roomId: command.roomId,
        ownerPortId: portId,
        generation: previousLease.generation,
      };
      this.activatePendingRoom();
      return;
    }

    this.generation += 1;
    const nextLease: ActiveRoomLease = {
      roomId: command.roomId,
      ownerPortId: portId,
      generation: this.generation,
    };

    if (previousLease && previousLease.ownerPortId !== portId) {
      this.sendToPort(previousLease.ownerPortId, {
        type: "ROOM_REPLACED",
        roomId: previousLease.roomId,
        activatedRoomId: command.roomId,
        generation: nextLease.generation,
      });
    }

    this.activeRoomLease = nextLease;
    this.pendingRoomActivation = {
      requestId: command.requestId,
      roomId: command.roomId,
      ownerPortId: portId,
      generation: nextLease.generation,
    };
    this.activatePendingRoom();
  }

  private releaseRoom(
    connectedPort: ConnectedPort,
    command: Extract<ChatSharedWorkerCommand, { type: "RELEASE_ROOM" }>,
  ): void {
    const lease = this.activeRoomLease;
    const ownsLease =
      lease?.ownerPortId === connectedPort.portId && lease.roomId === command.roomId;

    if (ownsLease) {
      this.tryReleaseRoom(command.roomId);
      this.generation += 1;
      this.activeRoomLease = null;
      this.pendingRoomActivation = null;
    }

    connectedPort.port.postMessage({
      type: "ROOM_RELEASED",
      requestId: command.requestId,
      roomId: command.roomId,
      generation: this.generation,
    });
  }

  private handleConnected(): void {
    if (this.getAttachedPortCount() === 0) {
      return;
    }

    try {
      this.subscriptions.connect();
    } catch (cause) {
      this.handleSubscriptionSetupFailure(cause);
      return;
    }

    this.setSnapshot("connected", null);
    this.completePendingRoomActivation();
  }

  private activatePendingRoom(): void {
    const pending = this.pendingRoomActivation;
    const lease = this.activeRoomLease;

    if (
      !pending ||
      !lease ||
      pending.generation !== lease.generation ||
      pending.ownerPortId !== lease.ownerPortId ||
      pending.roomId !== lease.roomId
    ) {
      return;
    }

    try {
      this.subscriptions.activateRoom(lease.roomId);
    } catch (cause) {
      this.handleSubscriptionSetupFailure(cause);
      return;
    }

    if (!this.subscriptions.connected) {
      return;
    }

    if (this.snapshot.status === "error") {
      this.setSnapshot("connected", null);
    }
    this.completePendingRoomActivation();
  }

  private completePendingRoomActivation(): void {
    const pending = this.pendingRoomActivation;
    const lease = this.activeRoomLease;

    if (
      !pending ||
      !lease ||
      this.subscriptions.activeRoomId !== lease.roomId ||
      pending.generation !== lease.generation ||
      pending.ownerPortId !== lease.ownerPortId ||
      pending.roomId !== lease.roomId
    ) {
      return;
    }

    this.pendingRoomActivation = null;
    this.sendToPort(pending.ownerPortId, {
      type: "ROOM_ACTIVATED",
      requestId: pending.requestId,
      roomId: pending.roomId,
      generation: pending.generation,
    });
  }

  private tryReleaseRoom(roomId: string): void {
    try {
      this.subscriptions.releaseRoom(roomId);
    } catch (cause) {
      this.setSnapshot("error", {
        source: "stomp",
        message:
          cause instanceof Error && cause.message.trim()
            ? cause.message
            : "기존 채팅방 STOMP 구독 해제에 실패했습니다.",
      });
    }
  }

  private handleSubscriptionSetupFailure(cause: unknown): void {
    const message =
      cause instanceof Error && cause.message.trim()
        ? cause.message
        : "채팅방 STOMP 구독을 설정하지 못했습니다.";
    const pending = this.pendingRoomActivation;
    const lease = this.activeRoomLease;

    if (lease) {
      this.tryReleaseRoom(lease.roomId);
    }
    this.pendingRoomActivation = null;

    if (lease) {
      this.generation += 1;
      this.activeRoomLease = null;
    }

    if (pending) {
      this.sendToPort(pending.ownerPortId, {
        type: "ROOM_ACTIVATION_FAILED",
        requestId: pending.requestId,
        roomId: pending.roomId,
        code: "SUBSCRIPTION_SETUP_FAILED",
        message,
      });
    } else if (lease) {
      this.sendToPort(lease.ownerPortId, {
        type: "ROOM_SUBSCRIPTION_FAILED",
        roomId: lease.roomId,
        generation: this.generation,
        code: "SUBSCRIPTION_SETUP_FAILED",
        message,
      });
    }

    this.setSnapshot("error", {
      source: "stomp",
      message,
    });
  }

  private readonly handleSystemEvent = (message: IMessage): void => {
    const rejection = parseChatSubscriptionRejection(message.body);
    const lease = this.activeRoomLease;

    if (
      !rejection ||
      !lease ||
      (rejection.destination !== getChatRoomMessagesDestination(lease.roomId) &&
        rejection.destination !== getChatRoomEventsDestination(lease.roomId))
    ) {
      return;
    }

    this.tryReleaseRoom(lease.roomId);
    this.pendingRoomActivation = null;
    this.generation += 1;
    this.activeRoomLease = null;
    this.sendToPort(lease.ownerPortId, {
      type: "ROOM_SUBSCRIPTION_FAILED",
      roomId: lease.roomId,
      generation: this.generation,
      code: rejection.code,
      message: `서버가 ${rejection.destination} 구독을 거절했습니다.`,
    });
  };

  private sendToPort(portId: string, event: ChatSharedWorkerEvent): void {
    for (const connectedPort of this.ports.values()) {
      if (connectedPort.attached && connectedPort.portId === portId) {
        connectedPort.port.postMessage(event);
        return;
      }
    }
  }

  private getAttachedPortCount(): number {
    let count = 0;

    for (const connectedPort of this.ports.values()) {
      if (connectedPort.attached) {
        count += 1;
      }
    }

    return count;
  }

  private setSnapshot(status: ChatConnectionStatus, error: ChatRealtimeError | null): void {
    this.snapshot = { status, error };
    this.broadcastSnapshot();
  }

  private broadcastSnapshot(): void {
    for (const connectedPort of this.ports.values()) {
      if (connectedPort.attached) {
        this.sendSnapshot(connectedPort);
      }
    }
  }

  private sendSnapshot(connectedPort: ConnectedPort): void {
    connectedPort.port.postMessage({
      type: "CONNECTION_SNAPSHOT",
      workerInstanceId: this.workerInstanceId,
      attachedPortCount: this.getAttachedPortCount(),
      snapshot: this.snapshot,
    });
  }
}

function getStompErrorMessage(frame: IFrame): string {
  return (
    frame.headers.message?.trim() || frame.body.trim() || "STOMP 서버가 연결 오류를 반환했습니다."
  );
}
