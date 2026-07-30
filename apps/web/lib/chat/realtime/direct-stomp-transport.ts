import type { Client, IMessage } from "@stomp/stompjs";
import { createChatStompClient } from "../chat-stomp-client";
import {
  getChatRoomEventsDestination,
  getChatRoomMessagesDestination,
} from "./chat-stomp-destinations";
import {
  parseChatMessageCreatedEvent,
  parseChatMessageCommandResult,
  parseChatRoomEventEnvelope,
  parseChatRoomSubscriptionSyncRejected,
  parseChatRoomSubscriptionsReady,
  parseChatSubscriptionRejection,
  type ChatRoomEventEnvelope,
  type ChatRoomSubscriptionSyncRejected,
  type ChatRoomSubscriptionsReady,
} from "./chat-stomp-contracts";
import {
  ChatRealtimeEventBuffer,
  type ChatRealtimeEventDelivery,
  type ChatRealtimeEventBufferSnapshot,
} from "./chat-realtime-event-buffer";
import { ChatStompSubscriptionManager } from "./chat-stomp-subscription-manager";
import {
  CHAT_CONNECTION_REPLACED_MESSAGE,
  isChatConnectionReplacedCloseEvent,
  type ChatConnectionSnapshot,
  type ChatConnectionStatus,
  type ChatMessageCommandEvent,
  type ChatRealtimeError,
  type ChatRealtimeTransport,
  ChatMessageSendError,
  type ChatRoomMessageSendCommand,
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
  | "publish"
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
  messageVisibleAfterSequence: null,
  watermarkSequence: null,
  error: null,
};

const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

type PendingRoomSync = Readonly<{
  requestId: string;
  roomId: string;
  generation: number;
}>;

type RealtimeDeliverySession = Readonly<{
  roomId: string;
  generation: number;
}>;

export class DirectStompTransport implements ChatRealtimeTransport {
  private attachmentCount = 0;
  private readonly listeners = new Set<() => void>();
  private readonly messageCommandListeners = new Set<(event: ChatMessageCommandEvent) => void>();
  private readonly pendingMessageRooms = new Map<string, string>();
  private pendingRoomSync: PendingRoomSync | null = null;
  private realtimeDeliverySession: RealtimeDeliverySession | null = null;
  private realtimeEventDelivery: ChatRealtimeEventDelivery | null = null;
  private readonly realtimeEventDeliveryListeners = new Set<() => void>();
  private readonly roomListeners = new Set<() => void>();
  private roomSnapshot: ChatRoomSessionSnapshot = INITIAL_ROOM_SNAPSHOT;
  private snapshot: ChatConnectionSnapshot = INITIAL_SNAPSHOT;
  private readonly subscriptions: ChatStompSubscriptionManager;

  constructor(
    private readonly client: DirectStompClient = createChatStompClient(),
    private readonly createId = () => crypto.randomUUID(),
    private readonly realtimeBuffer = new ChatRealtimeEventBuffer(),
  ) {
    this.subscriptions = new ChatStompSubscriptionManager(this.client, {
      onCommandResult: this.handleMessageCommandResult,
      onRoomEvent: this.handleRoomEvent,
      onRoomMessage: this.handleRoomMessage,
      onSystemEvent: this.handleSystemEvent,
    });
    this.client.onConnect = () => {
      if (this.attachmentCount === 0) {
        return;
      }

      const { generation, roomId, status } = this.roomSnapshot;

      if (roomId && status !== "idle") {
        this.realtimeBuffer.begin(roomId, generation);
      }

      try {
        this.subscriptions.connect();
      } catch (cause) {
        this.handleSubscriptionSetupFailure(cause);
        return;
      }

      this.setSnapshot("connected", null);

      if (this.roomSnapshot.roomId && this.roomSnapshot.status !== "idle") {
        this.startRoomSync(this.roomSnapshot.roomId, this.roomSnapshot.generation);
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
      this.pendingRoomSync = null;
      this.pauseRealtimeDelivery();

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

      if (this.roomSnapshot.roomId) {
        this.setRoomSnapshot({
          ...this.roomSnapshot,
          status: "claiming",
          messageVisibleAfterSequence: null,
          watermarkSequence: null,
          error: null,
        });
      }
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

  readonly getRealtimeBufferSnapshot = (): ChatRealtimeEventBufferSnapshot | null =>
    this.realtimeBuffer.getSnapshot();

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

  readonly observeRealtimeEventDelivery = (listener: () => void): (() => void) => {
    this.realtimeEventDeliveryListeners.add(listener);

    return () => {
      this.realtimeEventDeliveryListeners.delete(listener);
    };
  };

  readonly claimRoom = (roomId: string): void => {
    if (!ROOM_ID_PATTERN.test(roomId)) {
      this.setRoomSnapshot({
        status: "error",
        roomId,
        generation: this.roomSnapshot.generation,
        replacedByRoomId: null,
        messageVisibleAfterSequence: null,
        watermarkSequence: null,
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
      generation:
        this.roomSnapshot.roomId === roomId
          ? this.roomSnapshot.generation
          : this.roomSnapshot.generation + 1,
      replacedByRoomId: null,
      messageVisibleAfterSequence: null,
      watermarkSequence: null,
      error: null,
    };
    this.pauseRealtimeDelivery();
    this.setRoomSnapshot(claimingSnapshot);
    this.realtimeBuffer.begin(roomId, claimingSnapshot.generation);

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
      this.startRoomSync(roomId, claimingSnapshot.generation);
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
      this.pendingRoomSync = null;
      this.pauseRealtimeDelivery();
      this.realtimeBuffer.clear(roomId, this.roomSnapshot.generation);
      this.setRoomSnapshot({
        ...INITIAL_ROOM_SNAPSHOT,
        generation: this.roomSnapshot.generation + 1,
      });
    }
  };

  readonly markRoomSnapshotApplied = (roomId: string, generation: number): void => {
    if (
      this.roomSnapshot.status !== "active" ||
      this.roomSnapshot.roomId !== roomId ||
      this.roomSnapshot.generation !== generation
    ) {
      return;
    }

    this.realtimeDeliverySession = {
      roomId,
      generation,
    };
    this.deliverRealtimeEvents(true);
  };

  readonly acknowledgeRealtimeEventDelivery = (deliveryId: string): void => {
    const delivery = this.realtimeEventDelivery;

    if (!delivery || delivery.deliveryId !== deliveryId) {
      return;
    }

    const acknowledged = this.realtimeBuffer.acknowledge(
      delivery.roomId,
      delivery.generation,
      delivery.throughBufferSequence,
      delivery.invalidEventCount,
    );

    if (!acknowledged) {
      return;
    }

    this.setRealtimeEventDelivery(null);
    this.deliverRealtimeEvents(false);
  };

  readonly sendRoomMessage = ({ request, roomId }: ChatRoomMessageSendCommand): void => {
    if (this.snapshot.status !== "connected") {
      throw new ChatMessageSendError(
        "CONNECTION_NOT_READY",
        "WebSocket 연결이 준비되지 않아 메시지를 전송할 수 없습니다.",
        true,
      );
    }

    if (
      this.roomSnapshot.status !== "active" ||
      this.roomSnapshot.roomId !== roomId ||
      this.realtimeDeliverySession?.roomId !== roomId ||
      this.realtimeDeliverySession.generation !== this.roomSnapshot.generation
    ) {
      throw new ChatMessageSendError(
        "ROOM_NOT_ACTIVE",
        "현재 탭의 채팅방 동기화가 완료되지 않아 메시지를 전송할 수 없습니다.",
        true,
      );
    }

    this.pendingMessageRooms.set(request.clientMessageId, roomId);

    try {
      this.subscriptions.sendRoomMessage(roomId, request);
    } catch (cause) {
      this.pendingMessageRooms.delete(request.clientMessageId);
      throw new ChatMessageSendError(
        "MESSAGE_PUBLISH_FAILED",
        cause instanceof Error ? cause.message : "STOMP 메시지 전송에 실패했습니다.",
        true,
      );
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
    this.pendingRoomSync = null;
    this.pendingMessageRooms.clear();
    this.pauseRealtimeDelivery();
    this.realtimeBuffer.clear();
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
    this.pendingRoomSync = null;
    this.pauseRealtimeDelivery();
    this.realtimeBuffer.clear();

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
      this.realtimeBuffer.clear(roomId, this.roomSnapshot.generation);
      this.setRoomSnapshot({
        status: "error",
        roomId,
        generation: this.roomSnapshot.generation,
        replacedByRoomId: null,
        messageVisibleAfterSequence: null,
        watermarkSequence: null,
        error: {
          code: "SUBSCRIPTION_SETUP_FAILED",
          message,
        },
      });
    }
    this.pauseRealtimeDelivery();

    this.setSnapshot("error", {
      source: "stomp",
      message,
    });
  }

  private readonly handleMessageCommandResult = (message: IMessage): void => {
    const result = parseChatMessageCommandResult(message.body);

    if (!result) {
      return;
    }

    const roomId = this.pendingMessageRooms.get(result.clientMessageId);

    if (!roomId) {
      return;
    }

    this.pendingMessageRooms.delete(result.clientMessageId);
    const event: ChatMessageCommandEvent = {
      kind: "result",
      roomId,
      result,
    };
    this.messageCommandListeners.forEach((listener) => listener(event));
  };

  private readonly handleSystemEvent = (message: IMessage): void => {
    const ready = parseChatRoomSubscriptionsReady(message.body);

    if (ready) {
      this.completeRoomSync(ready);
      return;
    }

    const syncRejection = parseChatRoomSubscriptionSyncRejected(message.body);

    if (syncRejection) {
      this.handleRoomSyncRejection(syncRejection);
      return;
    }

    const roomEvent = parseChatRoomEventEnvelope(message.body);

    if (roomEvent) {
      this.bufferRoomEvent(roomEvent.payload.roomId, roomEvent);
      return;
    }

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
    this.pendingRoomSync = null;
    this.pauseRealtimeDelivery();
    this.realtimeBuffer.clear(roomId, this.roomSnapshot.generation);
    this.setRoomSnapshot({
      status: "error",
      roomId,
      generation: this.roomSnapshot.generation + 1,
      replacedByRoomId: null,
      messageVisibleAfterSequence: null,
      watermarkSequence: null,
      error: {
        code: "SUBSCRIPTION_REJECTED",
        serverCode: rejection.code,
        message: `서버가 ${rejection.destination} 구독을 거절했습니다.`,
      },
    });
  };

  private readonly handleRoomMessage = (roomId: string, message: IMessage): void => {
    const generation = this.getCurrentBufferGeneration(roomId);

    if (generation === null) {
      return;
    }

    const event = parseChatMessageCreatedEvent(message.body);

    if (!event) {
      if (this.realtimeBuffer.recordInvalidEvent(roomId, generation)) {
        this.deliverRealtimeEvents(false);
      }
      return;
    }

    if (this.realtimeBuffer.appendMessage(roomId, generation, event)) {
      this.deliverRealtimeEvents(false);
    }
  };

  private readonly handleRoomEvent = (roomId: string, message: IMessage): void => {
    const event = parseChatRoomEventEnvelope(message.body);

    if (!event) {
      const generation = this.getCurrentBufferGeneration(roomId);

      if (generation !== null) {
        if (this.realtimeBuffer.recordInvalidEvent(roomId, generation)) {
          this.deliverRealtimeEvents(false);
        }
      }
      return;
    }

    this.bufferRoomEvent(roomId, event);
  };

  private bufferRoomEvent(roomId: string, event: ChatRoomEventEnvelope): void {
    const generation = this.getCurrentBufferGeneration(roomId);

    if (generation === null) {
      return;
    }

    if (this.realtimeBuffer.appendRoomEvent(roomId, generation, event)) {
      this.deliverRealtimeEvents(false);
    }
  }

  private getCurrentBufferGeneration(roomId: string): number | null {
    return this.roomSnapshot.roomId === roomId ? this.roomSnapshot.generation : null;
  }

  private startRoomSync(roomId: string, generation: number): void {
    if (
      !this.subscriptions.connected ||
      this.subscriptions.activeRoomId !== roomId ||
      this.roomSnapshot.roomId !== roomId ||
      this.roomSnapshot.generation !== generation
    ) {
      return;
    }

    this.pauseRealtimeDelivery();
    const pendingSync: PendingRoomSync = {
      requestId: this.createId(),
      roomId,
      generation,
    };
    this.pendingRoomSync = pendingSync;

    try {
      this.subscriptions.syncRoomSubscriptions(roomId, pendingSync.requestId);
    } catch (cause) {
      this.pendingRoomSync = null;
      this.setRoomSyncError(
        roomId,
        generation,
        "ROOM_SUBSCRIPTION_SYNC_PUBLISH_FAILED",
        true,
        getSubscriptionErrorMessage(cause, "채팅방 구독 준비 sync 요청을 전송하지 못했습니다."),
      );
    }
  }

  private completeRoomSync(ready: ChatRoomSubscriptionsReady): void {
    const pendingSync = this.pendingRoomSync;

    if (
      !pendingSync ||
      pendingSync.requestId !== ready.requestId ||
      pendingSync.roomId !== ready.roomId ||
      this.roomSnapshot.roomId !== pendingSync.roomId ||
      this.roomSnapshot.generation !== pendingSync.generation
    ) {
      return;
    }

    this.pendingRoomSync = null;
    this.setRoomSnapshot({
      ...this.roomSnapshot,
      status: "active",
      messageVisibleAfterSequence: ready.messageVisibleAfterSequence,
      watermarkSequence: ready.watermarkSequence,
      error: null,
    });
  }

  private handleRoomSyncRejection(rejection: ChatRoomSubscriptionSyncRejected): void {
    const pendingSync = this.pendingRoomSync;

    if (
      !pendingSync ||
      pendingSync.requestId !== rejection.requestId ||
      pendingSync.roomId !== rejection.roomId ||
      this.roomSnapshot.roomId !== pendingSync.roomId ||
      this.roomSnapshot.generation !== pendingSync.generation
    ) {
      return;
    }

    this.pendingRoomSync = null;
    this.setRoomSyncError(
      rejection.roomId,
      pendingSync.generation,
      rejection.code,
      rejection.retryable,
      rejection.retryable
        ? "채팅방 구독 준비 확인에 일시적으로 실패했습니다. 이 탭에서 다시 활성화해 주세요."
        : "채팅방 구독 준비가 거절되었습니다. 방 구독 상태와 권한을 확인해 주세요.",
    );
  }

  private setRoomSyncError(
    roomId: string,
    generation: number,
    serverCode: string,
    retryable: boolean,
    message: string,
  ): void {
    if (this.roomSnapshot.roomId !== roomId || this.roomSnapshot.generation !== generation) {
      return;
    }

    this.setRoomSnapshot({
      status: "error",
      roomId,
      generation,
      replacedByRoomId: null,
      messageVisibleAfterSequence: null,
      watermarkSequence: null,
      error: {
        code: "SUBSCRIPTION_SYNC_REJECTED",
        serverCode,
        retryable,
        message,
      },
    });
  }

  private deliverRealtimeEvents(force: boolean): void {
    const session = this.realtimeDeliverySession;

    if (
      !session ||
      this.realtimeEventDelivery ||
      this.roomSnapshot.roomId !== session.roomId ||
      this.roomSnapshot.generation !== session.generation
    ) {
      return;
    }

    const snapshot = this.realtimeBuffer.getSnapshot();

    if (
      !snapshot ||
      snapshot.roomId !== session.roomId ||
      snapshot.generation !== session.generation ||
      (!force &&
        snapshot.events.length === 0 &&
        !snapshot.overflowed &&
        snapshot.invalidEventCount === 0)
    ) {
      return;
    }

    this.setRealtimeEventDelivery({
      ...snapshot,
      deliveryId: this.createId(),
    });
  }

  private pauseRealtimeDelivery(): void {
    this.realtimeDeliverySession = null;
    this.setRealtimeEventDelivery(null);
  }

  private setRealtimeEventDelivery(delivery: ChatRealtimeEventDelivery | null): void {
    if (this.realtimeEventDelivery === delivery) {
      return;
    }

    this.realtimeEventDelivery = delivery;
    this.realtimeEventDeliveryListeners.forEach((listener) => listener());
  }
}

function getSubscriptionErrorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message.trim() ? cause.message : fallback;
}
