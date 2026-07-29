import {
  CHAT_SHARED_WORKER_NAME,
  isChatSharedWorkerEvent,
  type ChatSharedWorkerCommand,
} from "./chat-shared-worker-protocol";
import type {
  ChatConnectionSnapshot,
  ChatRealtimeError,
  ChatRealtimeTransport,
  ChatRoomSessionSnapshot,
} from "./chat-realtime-transport";

type SharedWorkerTransportMessageListener = (event: MessageEvent<unknown>) => void;
type SharedWorkerTransportErrorListener = (event: Event) => void;

type SharedWorkerTransportPort = {
  addEventListener(
    type: "message" | "messageerror",
    listener: SharedWorkerTransportMessageListener,
  ): void;
  close(): void;
  postMessage(command: ChatSharedWorkerCommand): void;
  removeEventListener(
    type: "message" | "messageerror",
    listener: SharedWorkerTransportMessageListener,
  ): void;
  start(): void;
};

type SharedWorkerTransportWorker = {
  addEventListener(type: "error", listener: SharedWorkerTransportErrorListener): void;
  readonly port: SharedWorkerTransportPort;
  removeEventListener(type: "error", listener: SharedWorkerTransportErrorListener): void;
};

type SharedWorkerConnection = {
  port: SharedWorkerTransportPort;
  worker: SharedWorkerTransportWorker;
};

type SharedWorkerTransportOptions = {
  createId?: () => string;
  createWorker?: () => SharedWorkerTransportWorker;
};

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

export class SharedWorkerTransport implements ChatRealtimeTransport {
  private attachmentCount = 0;
  private connection: SharedWorkerConnection | null = null;
  private readonly createId: () => string;
  private readonly createWorker: () => SharedWorkerTransportWorker;
  private readonly listeners = new Set<() => void>();
  private pendingRoomRequestId: string | null = null;
  private portId: string | null = null;
  private readonly roomListeners = new Set<() => void>();
  private roomSnapshot: ChatRoomSessionSnapshot = INITIAL_ROOM_SNAPSHOT;
  private snapshot: ChatConnectionSnapshot = INITIAL_SNAPSHOT;

  constructor({
    createId = () => crypto.randomUUID(),
    createWorker = createBrowserChatSharedWorker,
  }: SharedWorkerTransportOptions = {}) {
    this.createId = createId;
    this.createWorker = createWorker;
  }

  attach(): () => void {
    this.attachmentCount += 1;

    if (this.attachmentCount === 1) {
      this.openConnection();
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
    if (this.roomSnapshot.status === "active" && this.roomSnapshot.roomId === roomId) {
      return;
    }

    const requestId = this.createId();
    this.pendingRoomRequestId = requestId;
    this.setRoomSnapshot({
      status: "claiming",
      roomId,
      generation: this.roomSnapshot.generation,
      replacedByRoomId: null,
      error: null,
    });

    this.postRoomCommand({
      type: "CLAIM_ROOM",
      requestId,
      roomId,
    });
  };

  readonly releaseRoom = (roomId: string): void => {
    const requestId = this.createId();
    const releasesCurrentRoom = this.roomSnapshot.roomId === roomId;

    if (releasesCurrentRoom) {
      this.pendingRoomRequestId = requestId;
      this.setRoomSnapshot({
        status: "releasing",
        roomId,
        generation: this.roomSnapshot.generation,
        replacedByRoomId: null,
        error: null,
      });
    }

    this.postRoomCommand({
      type: "RELEASE_ROOM",
      requestId,
      roomId,
    });
  };

  readonly reconnect = (): void => {
    if (this.attachmentCount === 0) {
      return;
    }

    if (!this.connection || !this.portId) {
      this.openConnection();
      return;
    }

    try {
      this.connection.port.postMessage({
        type: "RECONNECT",
        portId: this.portId,
      });
    } catch (cause) {
      this.closeConnection(false);
      this.setWorkerError(cause, "SharedWorker에 재연결 명령을 전달하지 못했습니다.");
    }
  };

  private openConnection(): void {
    this.setSnapshot({
      status: "connecting",
      error: null,
    });

    try {
      const worker = this.createWorker();
      const portId = this.createId();
      const { port } = worker;

      this.connection = { port, worker };
      this.portId = portId;
      port.addEventListener("message", this.handleMessage);
      port.addEventListener("messageerror", this.handleMessageError);
      worker.addEventListener("error", this.handleWorkerError);
      port.start();
      port.postMessage({
        type: "ATTACH",
        portId,
      });
    } catch (cause) {
      this.closeConnection(false);
      this.setWorkerError(cause, "SharedWorker를 생성하지 못했습니다.");
    }
  }

  private detach(): void {
    this.attachmentCount -= 1;

    if (this.attachmentCount > 0) {
      return;
    }

    this.setSnapshot({
      status: "disconnecting",
      error: null,
    });
    this.closeConnection(true);
    this.setSnapshot({
      status: "disconnected",
      error: null,
    });
    this.pendingRoomRequestId = null;
    this.setRoomSnapshot(INITIAL_ROOM_SNAPSHOT);
  }

  private readonly handleMessage = (event: MessageEvent<unknown>): void => {
    if (!isChatSharedWorkerEvent(event.data)) {
      return;
    }

    const workerEvent = event.data;

    switch (workerEvent.type) {
      case "CONNECTION_SNAPSHOT":
        this.setSnapshot(workerEvent.snapshot);
        return;
      case "ROOM_ACTIVATED":
        if (
          workerEvent.requestId === this.pendingRoomRequestId &&
          workerEvent.generation >= this.roomSnapshot.generation
        ) {
          this.pendingRoomRequestId = null;
          this.setRoomSnapshot({
            status: "active",
            roomId: workerEvent.roomId,
            generation: workerEvent.generation,
            replacedByRoomId: null,
            error: null,
          });
        }
        return;
      case "ROOM_REPLACED":
        if (workerEvent.generation >= this.roomSnapshot.generation) {
          this.pendingRoomRequestId = null;
          this.setRoomSnapshot({
            status: "replaced",
            roomId: workerEvent.roomId,
            generation: workerEvent.generation,
            replacedByRoomId: workerEvent.activatedRoomId,
            error: null,
          });
        }
        return;
      case "ROOM_RELEASED":
        if (
          workerEvent.requestId === this.pendingRoomRequestId &&
          workerEvent.generation >= this.roomSnapshot.generation
        ) {
          this.pendingRoomRequestId = null;
          this.setRoomSnapshot({
            ...INITIAL_ROOM_SNAPSHOT,
            generation: workerEvent.generation,
          });
        }
        return;
      case "ROOM_ACTIVATION_FAILED":
        if (workerEvent.requestId === this.pendingRoomRequestId) {
          this.pendingRoomRequestId = null;
          this.setRoomSnapshot({
            status: "error",
            roomId: workerEvent.roomId,
            generation: this.roomSnapshot.generation,
            replacedByRoomId: null,
            error: {
              code: workerEvent.code,
              message: workerEvent.message,
            },
          });
        }
    }
  };

  private readonly handleMessageError = (): void => {
    this.setWorkerError(null, "SharedWorker 메시지를 역직렬화하지 못했습니다.");
  };

  private readonly handleWorkerError = (event: Event): void => {
    this.closeConnection(true);
    this.setWorkerError(event, "SharedWorker 실행 중 오류가 발생했습니다.");
  };

  private closeConnection(notifyWorker: boolean): void {
    if (!this.connection) {
      return;
    }

    const { port, worker } = this.connection;

    if (notifyWorker && this.portId) {
      try {
        port.postMessage({
          type: "DETACH",
          portId: this.portId,
        });
      } catch {
        // The page still closes its side of the port. A terminated Worker cannot acknowledge DETACH.
      }
    }

    port.removeEventListener("message", this.handleMessage);
    port.removeEventListener("messageerror", this.handleMessageError);
    worker.removeEventListener("error", this.handleWorkerError);
    port.close();
    this.connection = null;
    this.portId = null;
  }

  private setWorkerError(cause: unknown, fallbackMessage: string): void {
    const error: ChatRealtimeError = {
      source: "worker",
      message: cause instanceof Error && cause.message.trim() ? cause.message : fallbackMessage,
    };

    this.setSnapshot({
      status: "error",
      error,
    });

    if (this.roomSnapshot.status !== "idle" && this.roomSnapshot.roomId) {
      this.setRoomWorkerError(this.roomSnapshot.roomId, error.message);
    }
  }

  private postRoomCommand(
    command:
      | Omit<Extract<ChatSharedWorkerCommand, { type: "CLAIM_ROOM" }>, "portId">
      | Omit<Extract<ChatSharedWorkerCommand, { type: "RELEASE_ROOM" }>, "portId">,
  ): void {
    if (!this.connection || !this.portId) {
      this.setRoomWorkerError(command.roomId, "SharedWorker port가 연결되어 있지 않습니다.");
      return;
    }

    try {
      this.connection.port.postMessage({
        ...command,
        portId: this.portId,
      });
    } catch (cause) {
      this.closeConnection(false);
      this.setWorkerError(cause, "SharedWorker에 방 세션 명령을 전달하지 못했습니다.");
    }
  }

  private setRoomWorkerError(roomId: string, message: string): void {
    this.pendingRoomRequestId = null;
    this.setRoomSnapshot({
      status: "error",
      roomId,
      generation: this.roomSnapshot.generation,
      replacedByRoomId: null,
      error: {
        code: "WORKER_UNAVAILABLE",
        message,
      },
    });
  }

  private setRoomSnapshot(snapshot: ChatRoomSessionSnapshot): void {
    this.roomSnapshot = snapshot;
    this.roomListeners.forEach((listener) => listener());
  }

  private setSnapshot(snapshot: ChatConnectionSnapshot): void {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }
}

function createBrowserChatSharedWorker(): SharedWorkerTransportWorker {
  return new SharedWorker(new URL("./worker/chat-realtime.shared-worker.ts", import.meta.url), {
    name: CHAT_SHARED_WORKER_NAME,
    type: "module",
  });
}
