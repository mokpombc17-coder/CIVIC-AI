import {
  CHAT_SHARED_WORKER_NAME,
  isChatSharedWorkerEvent,
  type ChatSharedWorkerCommand,
} from "./chat-shared-worker-protocol";
import type {
  ChatConnectionSnapshot,
  ChatRealtimeError,
  ChatRealtimeTransport,
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

export class SharedWorkerTransport implements ChatRealtimeTransport {
  private attachmentCount = 0;
  private connection: SharedWorkerConnection | null = null;
  private readonly createId: () => string;
  private readonly createWorker: () => SharedWorkerTransportWorker;
  private readonly listeners = new Set<() => void>();
  private portId: string | null = null;
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
  }

  private readonly handleMessage = (event: MessageEvent<unknown>): void => {
    if (isChatSharedWorkerEvent(event.data)) {
      this.setSnapshot(event.data.snapshot);
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
