import {
  CHAT_SHARED_WORKER_NAME,
  isChatSharedWorkerEvent,
  type ChatSharedWorkerCommand,
} from "./chat-shared-worker-protocol";
import type { ChatRealtimeEventDelivery } from "./chat-realtime-event-buffer";
import type { ChatMessageDeliveryLifecycleEvent } from "./chat-message-delivery-scheduler";
import {
  ChatMessageSendError,
  type ChatConnectionSnapshot,
  type ChatMessageCommandEvent,
  type ChatRealtimeError,
  type ChatRealtimeTransport,
  type ChatRoomMessageSendCommand,
  type ChatRoomSessionSnapshot,
} from "./chat-realtime-transport";

export type SharedWorkerTransportMessageListener = (event: MessageEvent<unknown>) => void;
export type SharedWorkerTransportErrorListener = (event: Event) => void;

export type SharedWorkerTransportPort = {
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

export type SharedWorkerTransportWorker = {
  addEventListener(type: "error", listener: SharedWorkerTransportErrorListener): void;
  readonly port: SharedWorkerTransportPort;
  removeEventListener(type: "error", listener: SharedWorkerTransportErrorListener): void;
};

type SharedWorkerConnection = {
  port: SharedWorkerTransportPort;
  worker: SharedWorkerTransportWorker;
};

export type SharedWorkerTransportOptions = {
  createId?: () => string;
  createWorker?: () => SharedWorkerTransportWorker;
  handshakeTimeoutMs?: number;
  onWorkerReady?: () => void;
  onWorkerUnavailable?: (error: ChatRealtimeError) => void;
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
  messageVisibleAfterSequence: null,
  watermarkSequence: null,
  error: null,
};

export class SharedWorkerTransport implements ChatRealtimeTransport {
  private attachmentCount = 0;
  private connection: SharedWorkerConnection | null = null;
  private readonly createId: () => string;
  private readonly createWorker: () => SharedWorkerTransportWorker;
  private handshakeTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly handshakeTimeoutMs: number;
  private readonly listeners = new Set<() => void>();
  private readonly messageCommandListeners = new Set<(event: ChatMessageCommandEvent) => void>();
  private readonly messageDeliveryLifecycleListeners = new Set<
    (event: ChatMessageDeliveryLifecycleEvent) => void
  >();
  private pendingRoomRequestId: string | null = null;
  private portId: string | null = null;
  private realtimeEventDelivery: ChatRealtimeEventDelivery | null = null;
  private readonly realtimeEventDeliveryListeners = new Set<() => void>();
  private readonly roomListeners = new Set<() => void>();
  private roomSnapshot: ChatRoomSessionSnapshot = INITIAL_ROOM_SNAPSHOT;
  private snapshot: ChatConnectionSnapshot = INITIAL_SNAPSHOT;
  private readonly onWorkerReady: () => void;
  private readonly onWorkerUnavailable: (error: ChatRealtimeError) => void;
  private workerReady = false;

  constructor({
    createId = () => crypto.randomUUID(),
    createWorker = createBrowserChatSharedWorker,
    handshakeTimeoutMs = 5_000,
    onWorkerReady = () => {},
    onWorkerUnavailable = () => {},
  }: SharedWorkerTransportOptions = {}) {
    this.createId = createId;
    this.createWorker = createWorker;
    this.handshakeTimeoutMs = handshakeTimeoutMs;
    this.onWorkerReady = onWorkerReady;
    this.onWorkerUnavailable = onWorkerUnavailable;
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

  readonly getRealtimeEventDelivery = (): ChatRealtimeEventDelivery | null =>
    this.realtimeEventDelivery;

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

  readonly observeMessageCommandEvent = (
    listener: (event: ChatMessageCommandEvent) => void,
  ): (() => void) => {
    this.messageCommandListeners.add(listener);

    return () => {
      this.messageCommandListeners.delete(listener);
    };
  };

  readonly observeMessageDeliveryLifecycle = (
    listener: (event: ChatMessageDeliveryLifecycleEvent) => void,
  ): (() => void) => {
    this.messageDeliveryLifecycleListeners.add(listener);

    return () => {
      this.messageDeliveryLifecycleListeners.delete(listener);
    };
  };

  readonly observeRealtimeEventDelivery = (listener: () => void): (() => void) => {
    this.realtimeEventDeliveryListeners.add(listener);

    return () => {
      this.realtimeEventDeliveryListeners.delete(listener);
    };
  };

  readonly claimRoom = (roomId: string): void => {
    if (this.roomSnapshot.status === "active" && this.roomSnapshot.roomId === roomId) {
      return;
    }

    const requestId = this.createId();
    this.setRealtimeEventDelivery(null);
    this.pendingRoomRequestId = requestId;
    this.setRoomSnapshot({
      status: "claiming",
      roomId,
      generation: this.roomSnapshot.generation,
      replacedByRoomId: null,
      messageVisibleAfterSequence: null,
      watermarkSequence: null,
      error: null,
    });

    if (this.attachmentCount === 0) {
      return;
    }

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
      this.setRealtimeEventDelivery(null);
      this.pendingRoomRequestId = requestId;
      this.setRoomSnapshot({
        status: "releasing",
        roomId,
        generation: this.roomSnapshot.generation,
        replacedByRoomId: null,
        messageVisibleAfterSequence: null,
        watermarkSequence: null,
        error: null,
      });
    }

    this.postRoomCommand({
      type: "RELEASE_ROOM",
      requestId,
      roomId,
    });
  };

  readonly markRoomSnapshotApplied = (roomId: string, generation: number): void => {
    if (
      this.roomSnapshot.status !== "active" ||
      this.roomSnapshot.roomId !== roomId ||
      this.roomSnapshot.generation !== generation
    ) {
      return;
    }

    this.postRoomCommand({
      type: "ROOM_SNAPSHOT_APPLIED",
      roomId,
      generation,
    });
  };

  readonly acknowledgeRealtimeEventDelivery = (deliveryId: string): void => {
    const delivery = this.realtimeEventDelivery;

    if (!delivery || delivery.deliveryId !== deliveryId) {
      return;
    }

    const posted = this.postRoomCommand({
      type: "ROOM_EVENTS_APPLIED",
      deliveryId,
      roomId: delivery.roomId,
      generation: delivery.generation,
    });

    if (posted) {
      this.setRealtimeEventDelivery(null);
    }
  };

  readonly sendRoomMessage = ({ request, roomId }: ChatRoomMessageSendCommand): void => {
    if (this.snapshot.status !== "connected") {
      throw new ChatMessageSendError(
        "CONNECTION_NOT_READY",
        "WebSocket 연결이 준비되지 않아 메시지를 전송할 수 없습니다.",
        true,
      );
    }

    if (this.roomSnapshot.status !== "active" || this.roomSnapshot.roomId !== roomId) {
      throw new ChatMessageSendError(
        "ROOM_NOT_ACTIVE",
        "현재 탭에서 활성화된 채팅방이 아니어서 메시지를 전송할 수 없습니다.",
        true,
      );
    }

    const posted = this.postRoomCommand({
      type: "SEND_ROOM_MESSAGE",
      roomId,
      request,
    });

    if (!posted) {
      throw new ChatMessageSendError(
        "MESSAGE_PUBLISH_FAILED",
        "SharedWorker에 메시지 전송 명령을 전달하지 못했습니다.",
        true,
      );
    }
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
      this.startHandshakeTimer();
      this.flushPendingRoomClaim();
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
    this.setRealtimeEventDelivery(null);
    this.setRoomSnapshot(INITIAL_ROOM_SNAPSHOT);
  }

  private readonly handleMessage = (event: MessageEvent<unknown>): void => {
    if (!isChatSharedWorkerEvent(event.data)) {
      return;
    }

    this.markWorkerReady();
    const workerEvent = event.data;

    switch (workerEvent.type) {
      case "CONNECTION_SNAPSHOT":
        this.setSnapshot(workerEvent.snapshot);

        if (
          workerEvent.snapshot.status === "reconnecting" &&
          this.roomSnapshot.status === "active"
        ) {
          this.setRealtimeEventDelivery(null);
          this.setRoomSnapshot({
            ...this.roomSnapshot,
            status: "claiming",
            messageVisibleAfterSequence: null,
            watermarkSequence: null,
          });
        }
        return;
      case "ROOM_SYNCING":
        if (
          workerEvent.generation >= this.roomSnapshot.generation &&
          (!this.roomSnapshot.roomId || this.roomSnapshot.roomId === workerEvent.roomId)
        ) {
          this.setRealtimeEventDelivery(null);
          this.setRoomSnapshot({
            status: "claiming",
            roomId: workerEvent.roomId,
            generation: workerEvent.generation,
            replacedByRoomId: null,
            messageVisibleAfterSequence: null,
            watermarkSequence: null,
            error: null,
          });
        }
        return;
      case "ROOM_ACTIVATED":
        if (this.matchesRoomActivationEvent(workerEvent)) {
          this.pendingRoomRequestId = null;
          this.setRoomSnapshot({
            status: "active",
            roomId: workerEvent.roomId,
            generation: workerEvent.generation,
            replacedByRoomId: null,
            messageVisibleAfterSequence: workerEvent.messageVisibleAfterSequence,
            watermarkSequence: workerEvent.watermarkSequence,
            error: null,
          });
        }
        return;
      case "ROOM_REPLACED":
        if (workerEvent.generation >= this.roomSnapshot.generation) {
          this.pendingRoomRequestId = null;
          this.setRealtimeEventDelivery(null);
          this.setRoomSnapshot({
            status: "replaced",
            roomId: workerEvent.roomId,
            generation: workerEvent.generation,
            replacedByRoomId: workerEvent.activatedRoomId,
            messageVisibleAfterSequence: null,
            watermarkSequence: null,
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
          this.setRealtimeEventDelivery(null);
          this.setRoomSnapshot({
            ...INITIAL_ROOM_SNAPSHOT,
            generation: workerEvent.generation,
          });
        }
        return;
      case "ROOM_SUBSCRIPTION_FAILED":
        if (workerEvent.generation >= this.roomSnapshot.generation) {
          this.pendingRoomRequestId = null;
          this.setRealtimeEventDelivery(null);
          this.setRoomSnapshot({
            status: "error",
            roomId: workerEvent.roomId,
            generation: workerEvent.generation,
            replacedByRoomId: null,
            messageVisibleAfterSequence: null,
            watermarkSequence: null,
            error: {
              code: workerEvent.code === "ROOM_CLOSED" ? "ROOM_CLOSED" : "SUBSCRIPTION_REJECTED",
              serverCode: workerEvent.code,
              message: workerEvent.message,
            },
          });
        }
        return;
      case "ROOM_SYNC_FAILED":
        if (this.matchesRoomActivationEvent(workerEvent)) {
          this.pendingRoomRequestId = null;
          this.setRealtimeEventDelivery(null);
          this.setRoomSnapshot({
            status: "error",
            roomId: workerEvent.roomId,
            generation: workerEvent.generation,
            replacedByRoomId: null,
            messageVisibleAfterSequence: null,
            watermarkSequence: null,
            error: {
              code: "SUBSCRIPTION_SYNC_REJECTED",
              serverCode: workerEvent.code,
              retryable: workerEvent.retryable,
              message: workerEvent.message,
            },
          });
        }
        return;
      case "ROOM_ACTIVATION_FAILED":
        if (workerEvent.requestId === this.pendingRoomRequestId) {
          this.pendingRoomRequestId = null;
          this.setRealtimeEventDelivery(null);
          this.setRoomSnapshot({
            status: "error",
            roomId: workerEvent.roomId,
            generation: this.roomSnapshot.generation,
            replacedByRoomId: null,
            messageVisibleAfterSequence: null,
            watermarkSequence: null,
            error: {
              code: workerEvent.code,
              message: workerEvent.message,
            },
          });
        }
        return;
      case "ROOM_MESSAGE_COMMAND_RESULT":
        this.emitMessageCommandEvent({
          kind: "result",
          roomId: workerEvent.roomId,
          result: workerEvent.result,
        });
        return;
      case "ROOM_MESSAGE_SEND_FAILED":
        this.emitMessageCommandEvent({
          kind: "failure",
          roomId: workerEvent.roomId,
          clientMessageId: workerEvent.clientMessageId,
          code: workerEvent.code,
          retryable: workerEvent.retryable,
          message: workerEvent.message,
        });
        return;
      case "ROOM_MESSAGE_DELIVERY_LIFECYCLE":
        if (
          workerEvent.event.roomId === this.roomSnapshot.roomId &&
          workerEvent.event.generation === this.roomSnapshot.generation
        ) {
          this.emitMessageDeliveryLifecycle(workerEvent.event);
        }
        return;
      case "ROOM_EVENTS_DELIVERED":
        if (
          this.roomSnapshot.status === "active" &&
          workerEvent.roomId === this.roomSnapshot.roomId &&
          workerEvent.generation === this.roomSnapshot.generation
        ) {
          this.setRealtimeEventDelivery({
            deliveryId: workerEvent.deliveryId,
            roomId: workerEvent.roomId,
            generation: workerEvent.generation,
            events: workerEvent.events,
            throughBufferSequence: workerEvent.throughBufferSequence,
            overflowed: workerEvent.overflowed,
            invalidEventCount: workerEvent.invalidEventCount,
          });
        }
    }
  };

  private emitMessageCommandEvent(event: ChatMessageCommandEvent): void {
    this.messageCommandListeners.forEach((listener) => listener(event));
  }

  private emitMessageDeliveryLifecycle(event: ChatMessageDeliveryLifecycleEvent): void {
    this.messageDeliveryLifecycleListeners.forEach((listener) => listener(event));
  }

  private matchesRoomActivationEvent(event: {
    requestId: string;
    roomId: string;
    generation: number;
  }): boolean {
    const matchesPendingRequest = event.requestId === this.pendingRoomRequestId;
    const matchesCurrentRoom =
      this.pendingRoomRequestId === null &&
      event.roomId === this.roomSnapshot.roomId &&
      event.generation === this.roomSnapshot.generation;

    return (
      (matchesPendingRequest || matchesCurrentRoom) &&
      event.generation >= this.roomSnapshot.generation
    );
  }

  private readonly handleMessageError = (): void => {
    this.setWorkerError(null, "SharedWorker 메시지를 역직렬화하지 못했습니다.");
  };

  private readonly handleWorkerError = (event: Event): void => {
    this.closeConnection(true);
    this.setWorkerError(event, "SharedWorker 실행 중 오류가 발생했습니다.");
  };

  private closeConnection(notifyWorker: boolean): void {
    this.clearHandshakeTimer();

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

    if (!this.workerReady) {
      this.onWorkerUnavailable(error);
    }

    this.setSnapshot({
      status: "error",
      error,
    });
    this.setRealtimeEventDelivery(null);

    if (this.roomSnapshot.status !== "idle" && this.roomSnapshot.roomId) {
      this.setRoomWorkerError(this.roomSnapshot.roomId, error.message);
    }
  }

  private postRoomCommand(
    command:
      | Omit<Extract<ChatSharedWorkerCommand, { type: "CLAIM_ROOM" }>, "portId">
      | Omit<Extract<ChatSharedWorkerCommand, { type: "RELEASE_ROOM" }>, "portId">
      | Omit<Extract<ChatSharedWorkerCommand, { type: "SEND_ROOM_MESSAGE" }>, "portId">
      | Omit<Extract<ChatSharedWorkerCommand, { type: "ROOM_SNAPSHOT_APPLIED" }>, "portId">
      | Omit<Extract<ChatSharedWorkerCommand, { type: "ROOM_EVENTS_APPLIED" }>, "portId">,
  ): boolean {
    if (!this.connection || !this.portId) {
      this.setRoomWorkerError(command.roomId, "SharedWorker port가 연결되어 있지 않습니다.");
      return false;
    }

    try {
      this.connection.port.postMessage({
        ...command,
        portId: this.portId,
      });
      return true;
    } catch (cause) {
      this.closeConnection(false);
      this.setWorkerError(cause, "SharedWorker에 방 세션 명령을 전달하지 못했습니다.");
      return false;
    }
  }

  private flushPendingRoomClaim(): void {
    const requestId = this.pendingRoomRequestId;
    const { roomId, status } = this.roomSnapshot;

    if (!requestId || !roomId || status !== "claiming") {
      return;
    }

    this.postRoomCommand({
      type: "CLAIM_ROOM",
      requestId,
      roomId,
    });
  }

  private setRoomWorkerError(roomId: string, message: string): void {
    this.pendingRoomRequestId = null;
    this.setRealtimeEventDelivery(null);
    this.setRoomSnapshot({
      status: "error",
      roomId,
      generation: this.roomSnapshot.generation,
      replacedByRoomId: null,
      messageVisibleAfterSequence: null,
      watermarkSequence: null,
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

  private setRealtimeEventDelivery(delivery: ChatRealtimeEventDelivery | null): void {
    if (this.realtimeEventDelivery === delivery) {
      return;
    }

    this.realtimeEventDelivery = delivery;
    this.realtimeEventDeliveryListeners.forEach((listener) => listener());
  }

  private setSnapshot(snapshot: ChatConnectionSnapshot): void {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }

  private startHandshakeTimer(): void {
    this.clearHandshakeTimer();
    this.handshakeTimer = setTimeout(() => {
      this.handshakeTimer = null;

      if (this.workerReady || !this.connection) {
        return;
      }

      this.closeConnection(true);
      this.setWorkerError(null, "SharedWorker가 초기 연결 응답을 보내지 않았습니다.");
    }, this.handshakeTimeoutMs);
  }

  private clearHandshakeTimer(): void {
    if (this.handshakeTimer === null) {
      return;
    }

    clearTimeout(this.handshakeTimer);
    this.handshakeTimer = null;
  }

  private markWorkerReady(): void {
    if (this.workerReady) {
      return;
    }

    this.workerReady = true;
    this.clearHandshakeTimer();
    this.onWorkerReady();
  }
}

function createBrowserChatSharedWorker(): SharedWorkerTransportWorker {
  return new SharedWorker(new URL("./worker/chat-realtime.shared-worker.ts", import.meta.url), {
    name: CHAT_SHARED_WORKER_NAME,
    type: "module",
  });
}
