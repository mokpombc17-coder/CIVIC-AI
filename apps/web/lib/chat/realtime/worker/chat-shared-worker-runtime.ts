import type { Client, IFrame } from "@stomp/stompjs";
import type {
  ChatConnectionSnapshot,
  ChatConnectionStatus,
  ChatRealtimeError,
} from "../chat-realtime-transport";
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

const INITIAL_SNAPSHOT: ChatConnectionSnapshot = {
  status: "idle",
  error: null,
};

const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export class ChatSharedWorkerRuntime {
  private activeRoomLease: ActiveRoomLease | null = null;
  private deactivation: Promise<void> | null = null;
  private generation = 0;
  private readonly ports = new Map<ChatSharedWorkerPort, ConnectedPort>();
  private snapshot: ChatConnectionSnapshot = INITIAL_SNAPSHOT;

  constructor(
    private readonly client: ChatSharedWorkerStompClient,
    private readonly workerInstanceId = crypto.randomUUID(),
  ) {
    this.client.onConnect = () => {
      if (this.getAttachedPortCount() > 0) {
        this.setSnapshot("connected", null);
      }
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
    if (connectedPort.portId === this.activeRoomLease?.ownerPortId) {
      this.generation += 1;
      this.activeRoomLease = null;
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
    if (this.client.active) {
      this.setSnapshot("reconnecting", null);
      this.client.forceDisconnect();
      return;
    }

    this.startConnection();
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
      connectedPort.port.postMessage({
        type: "ROOM_ACTIVATED",
        requestId: command.requestId,
        roomId: command.roomId,
        generation: previousLease.generation,
      });
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
    connectedPort.port.postMessage({
      type: "ROOM_ACTIVATED",
      requestId: command.requestId,
      roomId: command.roomId,
      generation: nextLease.generation,
    });
  }

  private releaseRoom(
    connectedPort: ConnectedPort,
    command: Extract<ChatSharedWorkerCommand, { type: "RELEASE_ROOM" }>,
  ): void {
    const lease = this.activeRoomLease;
    const ownsLease =
      lease?.ownerPortId === connectedPort.portId && lease.roomId === command.roomId;

    if (ownsLease) {
      this.generation += 1;
      this.activeRoomLease = null;
    }

    connectedPort.port.postMessage({
      type: "ROOM_RELEASED",
      requestId: command.requestId,
      roomId: command.roomId,
      generation: this.generation,
    });
  }

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
