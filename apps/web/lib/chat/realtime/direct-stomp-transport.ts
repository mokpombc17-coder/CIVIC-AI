import type { Client, IMessage } from "@stomp/stompjs";
import { createChatStompClient } from "../chat-stomp-client";
import {
  ChatMessageDeliveryScheduler,
  createChatMessageDeliveryStateLifecycleEvent,
  createChatMessageDeliveryTerminalLifecycleEvent,
  getChatMessageDeliveryFailureMessage,
  type ChatMessageDeliveryLifecycleEvent,
  type ChatMessageDeliverySnapshot,
  type ChatMessageDeliveryTerminalEvent,
} from "./chat-message-delivery-scheduler";
import {
  ChatMessageMutationScheduler,
  createChatMessageMutationStateLifecycleEvent,
  createChatMessageMutationTerminalLifecycleEvent,
  getChatMessageMutationFailureMessage,
  type ChatMessageMutationLifecycleEvent,
  type ChatMessageMutationSnapshot,
  type ChatMessageMutationTerminalEvent,
} from "./chat-message-mutation-scheduler";
import {
  getChatRoomEventsDestination,
  getChatRoomMessagesDestination,
  getChatRoomReadReceiptsDestination,
} from "./chat-stomp-destinations";
import {
  parseChatMessageEvent,
  parseChatMessageCommandResult,
  parseChatMessageMutationCommandResult,
  parseChatRoomInboxEvent,
  parseChatRoomEventEnvelope,
  parseChatRoomReadReceiptEvent,
  parseChatRoomSubscriptionSyncRejected,
  parseChatRoomSubscriptionsReady,
  parseChatStompError,
  parseChatSubscriptionRejection,
  type ChatRoomEventEnvelope,
  type ChatRoomInboxEvent,
  type ChatRoomReadReceiptEventEnvelope,
  type ChatRoomSubscriptionSyncRejected,
  type ChatRoomSubscriptionsReady,
} from "./chat-stomp-contracts";
import {
  ChatRealtimeEventBuffer,
  type ChatRealtimeEventDelivery,
  type ChatRealtimeEventBufferSnapshot,
} from "./chat-realtime-event-buffer";
import { ChatStompSubscriptionManager } from "./chat-stomp-subscription-manager";
import { ChatRealtimeDiagnosticStore } from "./diagnostics/chat-realtime-diagnostic-store";
import {
  CHAT_AUTHENTICATION_REQUIRED_MESSAGE,
  CHAT_CONNECTION_REPLACED_MESSAGE,
  CHAT_ROOM_ACCESS_REVOKED_MESSAGE,
  CHAT_ROOM_CLOSED_MESSAGE,
  ChatMessageMutationError,
  isChatConnectionReplacedCloseEvent,
  isChatRoomAccessRevokedCloseEvent,
  isChatRoomClosedCloseEvent,
  type ChatConnectionSnapshot,
  type ChatConnectionStatus,
  type ChatMessageCommandEvent,
  type ChatMessageMutationEvent,
  type ChatRealtimeError,
  type ChatRealtimeReconnectReason,
  type ChatRealtimeTransport,
  type ChatRoomReadStateConfirmation,
  ChatMessageSendError,
  type ChatRoomMessageDeleteCommand,
  type ChatRoomMessageEditCommand,
  type ChatRoomMessageSendCommand,
  type ChatRoomSessionSnapshot,
} from "./chat-realtime-transport";

export type DirectStompClient = Pick<
  Client,
  | "active"
  | "activate"
  | "beforeConnect"
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
const DIRECT_MESSAGE_DELIVERY_OWNER_ID = "direct-stomp-transport";

type PendingRoomSync = Readonly<{
  requestId: string;
  roomId: string;
  generation: number;
}>;

type RealtimeDeliverySession = Readonly<{
  roomId: string;
  generation: number;
}>;

type ConnectionAttemptTrigger =
  | "initial-attach"
  | "transport-reconnect"
  | "authentication-succeeded"
  | "deactivation-completed"
  | "manual";

export class DirectStompTransport implements ChatRealtimeTransport {
  private attachmentCount = 0;
  private connectionAttemptId: string | null = null;
  private connectionAttemptStartedAt = 0;
  private connectionRestart: Promise<void> | null = null;
  private diagnosticIdSequence = 0;
  private readonly listeners = new Set<() => void>();
  private principalGeneration = 0;
  private readonly principalGenerationListeners = new Set<() => void>();
  private readonly messageDeliveries: ChatMessageDeliveryScheduler;
  private readonly messageCommandListeners = new Set<(event: ChatMessageCommandEvent) => void>();
  private readonly messageMutationListeners = new Set<(event: ChatMessageMutationEvent) => void>();
  private readonly messageMutations: ChatMessageMutationScheduler;
  private pendingConnectionTrigger: ConnectionAttemptTrigger | null = null;
  private readonly messageDeliveryLifecycleListeners = new Set<
    (event: ChatMessageDeliveryLifecycleEvent) => void
  >();
  private readonly messageMutationLifecycleListeners = new Set<
    (event: ChatMessageMutationLifecycleEvent) => void
  >();
  private pendingRoomSync: PendingRoomSync | null = null;
  private realtimeDeliverySession: RealtimeDeliverySession | null = null;
  private realtimeEventDelivery: ChatRealtimeEventDelivery | null = null;
  private readonly realtimeEventDeliveryListeners = new Set<() => void>();
  private readonly roomListeners = new Set<() => void>();
  private readonly roomInboxEventListeners = new Set<(event: ChatRoomInboxEvent) => void>();
  private readonly roomReadStateConfirmationListeners = new Set<
    (confirmation: ChatRoomReadStateConfirmation) => void
  >();
  private roomClaimRequestId: string | null = null;
  private roomSnapshot: ChatRoomSessionSnapshot = INITIAL_ROOM_SNAPSHOT;
  private snapshot: ChatConnectionSnapshot = INITIAL_SNAPSHOT;
  private readonly subscriptions: ChatStompSubscriptionManager;

  constructor(
    private readonly client: DirectStompClient = createChatStompClient(),
    private readonly createId = () => crypto.randomUUID(),
    private readonly realtimeBuffer = new ChatRealtimeEventBuffer(),
    private readonly runtimeInstanceId = crypto.randomUUID(),
    private readonly diagnostics = new ChatRealtimeDiagnosticStore({
      runtimeInstanceId,
    }),
    private readonly createDiagnosticId = () => crypto.randomUUID(),
    private readonly monotonicNow = () => performance.now(),
  ) {
    this.diagnostics.emit({
      event: "runtime.started",
      transportKind: "direct",
    });
    this.subscriptions = new ChatStompSubscriptionManager(this.client, {
      onCommandResult: this.handleMessageCommandResult,
      onRoomInboxEvent: this.handleRoomInboxEvent,
      onRoomEvent: this.handleRoomEvent,
      onRoomMessage: this.handleRoomMessage,
      onRoomReadReceiptEvent: this.handleRoomReadReceiptEvent,
      onSystemEvent: this.handleSystemEvent,
    });
    this.messageDeliveries = new ChatMessageDeliveryScheduler({
      isContextCurrent: (snapshot) => this.isMessageDeliveryContextCurrent(snapshot),
      onStateChange: (snapshot) => {
        this.emitMessageDeliveryLifecycle(createChatMessageDeliveryStateLifecycleEvent(snapshot));
      },
      onTerminal: (event) => this.handleMessageDeliveryTerminal(event),
      publish: ({ request, roomId }) => {
        this.subscriptions.sendRoomMessage(roomId, request);
      },
    });
    this.messageMutations = new ChatMessageMutationScheduler({
      isContextCurrent: (snapshot) => this.isMessageMutationContextCurrent(snapshot),
      onStateChange: (snapshot) => {
        this.emitMessageMutationLifecycle(createChatMessageMutationStateLifecycleEvent(snapshot));
      },
      onTerminal: (event) => this.handleMessageMutationTerminal(event),
      publish: ({ commandType, request, roomId }) => {
        if (commandType === "EDIT_MESSAGE") {
          this.subscriptions.editRoomMessage(roomId, request);
          return;
        }
        this.subscriptions.deleteRoomMessage(roomId, request);
      },
    });
    this.client.beforeConnect = () => {
      if (!this.connectionAttemptId) {
        this.beginConnectionAttempt(this.pendingConnectionTrigger ?? "transport-reconnect");
      }
      this.pendingConnectionTrigger = null;
    };
    this.client.onConnect = () => {
      if (this.attachmentCount === 0) {
        return;
      }

      if (this.connectionAttemptId) {
        this.diagnostics.emit({
          event: "stomp.connected",
          connectionAttemptId: this.connectionAttemptId,
          connectionDurationMs: this.getConnectionDurationMs(),
        });
      }

      const { error: roomError, generation, roomId, status } = this.roomSnapshot;
      const shouldRestoreRoom =
        !!roomId && status !== "idle" && !(status === "error" && roomError?.code === "ROOM_CLOSED");

      if (shouldRestoreRoom && roomId) {
        this.realtimeBuffer.begin(roomId, generation);
      }

      try {
        this.subscriptions.connect();
      } catch (cause) {
        this.handleSubscriptionSetupFailure(cause);
        return;
      }

      if (shouldRestoreRoom && roomId) {
        this.diagnostics.emit({
          event: "room.subscriptions.started",
          roomId,
          generation,
        });
      }

      this.setSnapshot("connected", null);

      if (shouldRestoreRoom && roomId) {
        this.startRoomSync(roomId, generation);
      }
    };
    this.client.onStompError = (frame) => {
      const stompError = parseChatStompError(frame);
      const stompErrorCode = stompError?.code ?? frame.headers.message?.trim() ?? null;
      this.diagnostics.emit({
        event: "stomp.error",
        connectionAttemptId: this.connectionAttemptId,
        code: stompErrorCode ? sanitizeDiagnosticText(stompErrorCode) : null,
        retryable: stompError?.retryable ?? null,
      });

      if (stompError?.code === "AUTHENTICATION_REQUIRED") {
        this.diagnostics.emit({
          event: "authentication.required",
          connectionAttemptId: this.connectionAttemptId,
        });
        this.stopAuthenticationRequiredReconnect();
        return;
      }

      if (this.snapshot.status === "authentication-required") {
        return;
      }

      this.setSnapshot("error", {
        source: "stomp",
        message:
          frame.headers.message?.trim() ||
          frame.body.trim() ||
          "STOMP 서버가 연결 오류를 반환했습니다.",
      });
    };
    this.client.onWebSocketError = () => {
      this.diagnostics.emit({
        event: "websocket.error",
        connectionAttemptId: this.connectionAttemptId,
      });
      if (this.snapshot.status === "authentication-required") {
        return;
      }

      this.setSnapshot("error", {
        source: "websocket",
        message: "WebSocket 연결 중 오류가 발생했습니다.",
      });
    };
    this.client.onWebSocketClose = (event) => {
      const statusBefore = this.snapshot.status;
      this.subscriptions.disconnect();
      this.pendingRoomSync = null;
      this.messageMutations.cancelAll("WEBSOCKET_CLOSED");
      this.pauseRealtimeDelivery();
      this.messageDeliveries.cancelAll("WEBSOCKET_CLOSED");

      if (this.snapshot.status === "authentication-required") {
        this.recordWebSocketClose(event, statusBefore, "authentication-state-preserved");
        return;
      }

      if (isChatConnectionReplacedCloseEvent(event)) {
        this.recordWebSocketClose(event, statusBefore, "connection-replaced");
        this.stopConnectionReplacedReconnect();
        return;
      }

      if (isChatRoomAccessRevokedCloseEvent(event)) {
        this.recordWebSocketClose(event, statusBefore, "room-access-revoked");
        this.restartAfterRoomAccessRevoked();
        return;
      }

      if (isChatRoomClosedCloseEvent(event)) {
        this.recordWebSocketClose(event, statusBefore, "room-closed");
        this.restartAfterRoomClosed();
        return;
      }

      if (this.connectionRestart) {
        this.recordWebSocketClose(event, statusBefore, "disconnected");
        return;
      }

      if (this.attachmentCount === 0 || !this.client.active) {
        this.recordWebSocketClose(event, statusBefore, "disconnected");
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
      this.recordWebSocketClose(event, statusBefore, "reconnecting");
      this.setSnapshot("reconnecting", error);
    };
  }

  attach(): () => void {
    this.attachmentCount += 1;

    if (this.attachmentCount === 1) {
      this.beginConnectionAttempt("initial-attach");
      this.pendingConnectionTrigger = null;
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

  readonly getDiagnosticSnapshot = () => Promise.resolve(this.diagnostics.getSnapshot());

  readonly clearDiagnostics = (): Promise<void> => {
    this.diagnostics.clear();
    return Promise.resolve();
  };

  readonly getSnapshot = (): ChatConnectionSnapshot => this.snapshot;

  readonly getRoomSnapshot = (): ChatRoomSessionSnapshot => this.roomSnapshot;

  readonly getRealtimeBufferSnapshot = (): ChatRealtimeEventBufferSnapshot | null =>
    this.realtimeBuffer.getSnapshot();

  readonly getRealtimeEventDelivery = (): ChatRealtimeEventDelivery | null =>
    this.realtimeEventDelivery;

  readonly getPrincipalGeneration = (): number => this.principalGeneration;

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

  readonly observeRoomInboxEvent = (
    listener: (event: ChatRoomInboxEvent) => void,
  ): (() => void) => {
    this.roomInboxEventListeners.add(listener);

    return () => {
      this.roomInboxEventListeners.delete(listener);
    };
  };

  readonly observePrincipalGeneration = (listener: () => void): (() => void) => {
    this.principalGenerationListeners.add(listener);
    return () => this.principalGenerationListeners.delete(listener);
  };

  readonly observeRoomReadStateConfirmation = (
    listener: (confirmation: ChatRoomReadStateConfirmation) => void,
  ): (() => void) => {
    this.roomReadStateConfirmationListeners.add(listener);
    return () => this.roomReadStateConfirmationListeners.delete(listener);
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

  readonly observeMessageMutationEvent = (
    listener: (event: ChatMessageMutationEvent) => void,
  ): (() => void) => {
    this.messageMutationListeners.add(listener);

    return () => {
      this.messageMutationListeners.delete(listener);
    };
  };

  readonly observeMessageMutationLifecycle = (
    listener: (event: ChatMessageMutationLifecycleEvent) => void,
  ): (() => void) => {
    this.messageMutationLifecycleListeners.add(listener);

    return () => {
      this.messageMutationLifecycleListeners.delete(listener);
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

    const previousRoomId = this.roomSnapshot.roomId;
    this.messageDeliveries.cancelAll("ROOM_REPLACED");
    this.messageMutations.cancelAll("ROOM_REPLACED");
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
    const claimRequestId = this.nextDiagnosticId();
    this.roomClaimRequestId = claimRequestId;
    this.diagnostics.emit({
      event: "room.claim.requested",
      portId: DIRECT_MESSAGE_DELIVERY_OWNER_ID,
      requestId: claimRequestId,
      roomId,
      generation: claimingSnapshot.generation,
    });
    if (previousRoomId && previousRoomId !== roomId) {
      this.diagnostics.emit({
        event: "room.replaced",
        roomId: previousRoomId,
        activatedRoomId: roomId,
        generation: claimingSnapshot.generation,
      });
    }
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
      this.diagnostics.emit({
        event: "room.subscriptions.started",
        roomId,
        generation: claimingSnapshot.generation,
      });
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

    this.cancelMessageDeliveriesForRoom(roomId, "ROOM_RELEASED");
    this.messageMutations.cancelMatching((snapshot) => snapshot.roomId === roomId, "ROOM_RELEASED");
    try {
      this.subscriptions.releaseRoom(roomId);
    } catch (cause) {
      this.setSnapshot("error", {
        source: "stomp",
        message: getSubscriptionErrorMessage(cause, "기존 채팅방 STOMP 구독 해제에 실패했습니다."),
      });
    } finally {
      const releasedGeneration = this.roomSnapshot.generation + 1;
      this.pendingRoomSync = null;
      this.roomClaimRequestId = null;
      this.pauseRealtimeDelivery();
      this.realtimeBuffer.clear(roomId, this.roomSnapshot.generation);
      this.setRoomSnapshot({
        ...INITIAL_ROOM_SNAPSHOT,
        generation: releasedGeneration,
      });
      this.diagnostics.emit({
        event: "room.released",
        requestId: this.nextDiagnosticId(),
        roomId,
        generation: releasedGeneration,
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
      delivery.invalidReadReceiptEventCount,
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

    try {
      this.messageDeliveries.start({
        generation: this.roomSnapshot.generation,
        ownerId: DIRECT_MESSAGE_DELIVERY_OWNER_ID,
        request,
        roomId,
      });
    } catch (cause) {
      throw new ChatMessageSendError(
        "MESSAGE_PUBLISH_FAILED",
        cause instanceof Error ? cause.message : "STOMP 메시지 전송에 실패했습니다.",
        true,
      );
    }
  };

  readonly editRoomMessage = ({ request, roomId }: ChatRoomMessageEditCommand): void => {
    this.startRoomMessageMutation({
      commandType: "EDIT_MESSAGE",
      request,
      roomId,
    });
  };

  readonly deleteRoomMessage = ({ request, roomId }: ChatRoomMessageDeleteCommand): void => {
    this.startRoomMessageMutation({
      commandType: "DELETE_MESSAGE",
      request,
      roomId,
    });
  };

  private startRoomMessageMutation(
    input:
      | {
          commandType: "EDIT_MESSAGE";
          request: ChatRoomMessageEditCommand["request"];
          roomId: string;
        }
      | {
          commandType: "DELETE_MESSAGE";
          request: ChatRoomMessageDeleteCommand["request"];
          roomId: string;
        },
  ): void {
    const { roomId } = input;

    if (this.snapshot.status !== "connected") {
      throw new ChatMessageMutationError(
        "CONNECTION_NOT_READY",
        "WebSocket 연결이 준비되지 않아 메시지를 변경할 수 없습니다.",
        true,
      );
    }

    if (
      this.roomSnapshot.status !== "active" ||
      this.roomSnapshot.roomId !== roomId ||
      this.realtimeDeliverySession?.roomId !== roomId ||
      this.realtimeDeliverySession.generation !== this.roomSnapshot.generation
    ) {
      throw new ChatMessageMutationError(
        "ROOM_NOT_ACTIVE",
        "현재 탭의 채팅방 동기화가 완료되지 않아 메시지를 변경할 수 없습니다.",
        true,
      );
    }

    try {
      this.messageMutations.start({
        ...input,
        generation: this.roomSnapshot.generation,
        ownerId: DIRECT_MESSAGE_DELIVERY_OWNER_ID,
      });
    } catch (cause) {
      throw new ChatMessageMutationError(
        "MUTATION_PUBLISH_FAILED",
        cause instanceof Error ? cause.message : "STOMP 메시지 변경 요청 전송에 실패했습니다.",
        true,
      );
    }
  }

  readonly reconnect = (reason?: ChatRealtimeReconnectReason): void => {
    this.diagnostics.emit({
      event: "reconnect.requested",
      reason: reason ?? "manual",
      statusBefore: this.snapshot.status,
    });

    if (reason === "authentication-succeeded") {
      this.principalGeneration += 1;
      this.principalGenerationListeners.forEach((listener) => listener());
      if (this.snapshot.status === "authentication-required" && this.attachmentCount > 0) {
        this.beginConnectionAttempt("authentication-succeeded");
        this.pendingConnectionTrigger = null;
        this.setSnapshot("connecting", null);
        this.client.activate();
      }
      return;
    }

    if (
      this.attachmentCount === 0 ||
      this.snapshot.status === "replaced" ||
      this.snapshot.status === "authentication-required" ||
      this.connectionRestart
    ) {
      this.diagnostics.emit({
        event: "reconnect.suppressed",
        reason:
          this.attachmentCount === 0
            ? "no-attached-ports"
            : this.snapshot.status === "replaced"
              ? "connection-replaced"
              : this.snapshot.status === "authentication-required"
                ? "authentication-required"
                : "inactive-client",
        statusBefore: this.snapshot.status,
      });
      return;
    }

    this.messageDeliveries.cancelAll("TRANSPORT_RECONNECTING");
    this.messageMutations.cancelAll("TRANSPORT_RECONNECTING");
    if (this.client.active) {
      this.subscriptions.disconnect();
      this.setSnapshot("reconnecting", null);
      this.pendingConnectionTrigger = "manual";
      this.client.forceDisconnect();
      return;
    }

    this.beginConnectionAttempt("manual");
    this.pendingConnectionTrigger = null;
    this.setSnapshot("connecting", null);
    this.client.activate();
  };

  readonly confirmRoomReadState = (): void => {
    // Direct transport has no same-browser peer. The local provider already applies success.
  };

  private beginConnectionAttempt(trigger: ConnectionAttemptTrigger): void {
    this.connectionAttemptId = this.nextDiagnosticId();

    try {
      this.connectionAttemptStartedAt = this.monotonicNow();
    } catch {
      this.connectionAttemptStartedAt = 0;
    }
    this.diagnostics.emit({
      event: "connection.requested",
      connectionAttemptId: this.connectionAttemptId,
      trigger,
      statusBefore: this.snapshot.status,
    });
  }

  private nextDiagnosticId(): string {
    this.diagnosticIdSequence += 1;

    try {
      const value = this.createDiagnosticId().trim();
      return value && value.length <= 128 ? value : `diagnostic-${this.diagnosticIdSequence}`;
    } catch {
      return `diagnostic-${this.diagnosticIdSequence}`;
    }
  }

  private getConnectionDurationMs(): number {
    try {
      return Math.max(0, this.monotonicNow() - this.connectionAttemptStartedAt);
    } catch {
      return 0;
    }
  }

  private recordWebSocketClose(
    event: CloseEvent,
    statusBefore: ChatConnectionStatus,
    reconnectDecision:
      | "authentication-state-preserved"
      | "connection-replaced"
      | "room-access-revoked"
      | "room-closed"
      | "reconnecting"
      | "disconnected",
  ): void {
    this.diagnostics.emit({
      event: "websocket.closed",
      connectionAttemptId: this.connectionAttemptId,
      closeCode: event.code,
      closeReason: sanitizeDiagnosticText(event.reason),
      wasClean: event.wasClean,
      statusBefore,
      reconnectDecision,
    });
    this.connectionAttemptId = null;
    this.connectionAttemptStartedAt = 0;
  }

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
    this.messageMutations.cancelAll("TRANSPORT_DETACHED");
    this.messageDeliveries.cancelAll("TRANSPORT_DETACHED");
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

  private stopAuthenticationRequiredReconnect(): void {
    this.connectionRestart = null;
    this.pendingRoomSync = null;
    this.messageDeliveries.cancelAll("AUTHENTICATION_REQUIRED");
    this.messageMutations.cancelAll("AUTHENTICATION_REQUIRED");
    this.subscriptions.disconnect();
    this.pauseRealtimeDelivery();
    this.realtimeBuffer.clear();
    this.setSnapshot("authentication-required", {
      source: "stomp",
      code: "AUTHENTICATION_REQUIRED",
      message: CHAT_AUTHENTICATION_REQUIRED_MESSAGE,
    });

    try {
      void this.client.deactivate().catch(() => {
        // Keep the terminal authentication state even if STOMP cleanup rejects.
      });
    } catch {
      // Keep the terminal authentication state even if STOMP cleanup throws synchronously.
    }
  }

  private stopConnectionReplacedReconnect(): void {
    this.connectionRestart = null;
    this.pendingRoomSync = null;
    this.messageDeliveries.cancelAll("CONNECTION_REPLACED");
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

  private restartAfterRoomAccessRevoked(): void {
    const roomId = this.roomSnapshot.roomId;

    if (roomId) {
      const generation = this.roomSnapshot.generation + 1;
      this.realtimeBuffer.clear(roomId, this.roomSnapshot.generation);
      this.realtimeBuffer.begin(roomId, generation);
      this.setRoomSnapshot({
        status: "claiming",
        roomId,
        generation,
        replacedByRoomId: null,
        messageVisibleAfterSequence: null,
        watermarkSequence: null,
        error: null,
      });
    }

    this.messageDeliveries.cancelAll("ROOM_ACCESS_REVOKED");
    this.restartConnectionAfterServerClose({
      source: "websocket",
      code: "ROOM_ACCESS_REVOKED",
      message: CHAT_ROOM_ACCESS_REVOKED_MESSAGE,
    });
  }

  private restartAfterRoomClosed(): void {
    const roomId = this.roomSnapshot.roomId;

    if (roomId) {
      try {
        this.subscriptions.releaseRoom(roomId);
      } catch {
        // The closed WebSocket cannot retain a usable room subscription.
      }
      this.realtimeBuffer.clear(roomId, this.roomSnapshot.generation);
      this.setRoomSnapshot({
        status: "error",
        roomId,
        generation: this.roomSnapshot.generation + 1,
        replacedByRoomId: null,
        messageVisibleAfterSequence: null,
        watermarkSequence: null,
        error: {
          code: "ROOM_CLOSED",
          serverCode: "ROOM_CLOSED",
          message: CHAT_ROOM_CLOSED_MESSAGE,
        },
      });
    }

    this.messageDeliveries.cancelAll("ROOM_CLOSED");
    this.restartConnectionAfterServerClose({
      source: "websocket",
      code: "ROOM_CLOSED",
      message: CHAT_ROOM_CLOSED_MESSAGE,
    });
  }

  private restartConnectionAfterServerClose(error: ChatRealtimeError): void {
    this.setSnapshot("reconnecting", error);

    if (this.connectionRestart) {
      return;
    }

    let operation: Promise<void>;

    try {
      operation = this.client.deactivate();
    } catch (cause) {
      this.setSnapshot("error", {
        source: "websocket",
        message: getSubscriptionErrorMessage(cause, "기존 WebSocket 연결을 폐기하지 못했습니다."),
      });
      return;
    }

    this.connectionRestart = operation;
    void operation.then(
      () => {
        if (this.connectionRestart !== operation) {
          return;
        }

        this.connectionRestart = null;

        if (this.attachmentCount === 0) {
          this.setSnapshot("disconnected", null);
          return;
        }

        this.beginConnectionAttempt("deactivation-completed");
        this.pendingConnectionTrigger = null;
        this.client.activate();
      },
      (cause: unknown) => {
        if (this.connectionRestart !== operation) {
          return;
        }

        this.connectionRestart = null;
        this.setSnapshot("error", {
          source: "websocket",
          message: getSubscriptionErrorMessage(cause, "기존 WebSocket 연결을 폐기하지 못했습니다."),
        });
      },
    );
  }

  private setRoomSnapshot(snapshot: ChatRoomSessionSnapshot): void {
    this.roomSnapshot = snapshot;
    this.roomListeners.forEach((listener) => listener());
  }

  private handleSubscriptionSetupFailure(cause: unknown): void {
    const message = getSubscriptionErrorMessage(cause, "채팅 STOMP 구독을 설정하지 못했습니다.");
    const roomId = this.roomSnapshot.roomId;

    if (roomId) {
      this.cancelMessageDeliveriesForRoom(roomId, "SUBSCRIPTION_SETUP_FAILED");
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

    if (result) {
      this.messageDeliveries.handleCommandResult(result);
      return;
    }

    const mutationResult = parseChatMessageMutationCommandResult(message.body);

    if (!mutationResult) {
      return;
    }

    this.messageMutations.handleCommandResult(mutationResult);
  };

  private readonly handleRoomInboxEvent = (message: IMessage): void => {
    const event = parseChatRoomInboxEvent(message.body);

    if (event) {
      this.roomInboxEventListeners.forEach((listener) => listener(event));
    }
  };

  private cancelMessageDeliveriesForRoom(roomId: string, reason: string): void {
    this.messageDeliveries.cancelMatching((snapshot) => snapshot.roomId === roomId, reason);
  }

  private isMessageDeliveryContextCurrent(snapshot: ChatMessageDeliverySnapshot): boolean {
    const deliverySession = this.realtimeDeliverySession;

    return (
      snapshot.ownerId === DIRECT_MESSAGE_DELIVERY_OWNER_ID &&
      this.snapshot.status === "connected" &&
      this.subscriptions.connected &&
      this.subscriptions.activeRoomId === snapshot.roomId &&
      this.roomSnapshot.status === "active" &&
      this.roomSnapshot.roomId === snapshot.roomId &&
      this.roomSnapshot.generation === snapshot.generation &&
      deliverySession?.roomId === snapshot.roomId &&
      deliverySession.generation === snapshot.generation
    );
  }

  private isMessageMutationContextCurrent(snapshot: ChatMessageMutationSnapshot): boolean {
    const deliverySession = this.realtimeDeliverySession;

    return (
      snapshot.ownerId === DIRECT_MESSAGE_DELIVERY_OWNER_ID &&
      this.snapshot.status === "connected" &&
      this.subscriptions.connected &&
      this.subscriptions.activeRoomId === snapshot.roomId &&
      this.roomSnapshot.status === "active" &&
      this.roomSnapshot.roomId === snapshot.roomId &&
      this.roomSnapshot.generation === snapshot.generation &&
      deliverySession?.roomId === snapshot.roomId &&
      deliverySession.generation === snapshot.generation
    );
  }

  private handleMessageDeliveryTerminal(event: ChatMessageDeliveryTerminalEvent): void {
    this.emitMessageDeliveryLifecycle(createChatMessageDeliveryTerminalLifecycleEvent(event));

    if (event.kind === "cancelled") {
      return;
    }

    if (event.kind === "sent") {
      this.emitMessageCommandEvent({
        kind: "result",
        roomId: event.snapshot.roomId,
        result: event.result,
      });
      return;
    }

    if (event.result) {
      this.emitMessageCommandEvent({
        kind: "result",
        roomId: event.snapshot.roomId,
        result: event.result,
      });
      return;
    }

    this.emitMessageCommandEvent({
      kind: "failure",
      roomId: event.snapshot.roomId,
      clientMessageId: event.snapshot.request.clientMessageId,
      code: "MESSAGE_PUBLISH_FAILED",
      retryable: event.reason === "PUBLISH_FAILED" || event.reason === "COMMAND_RESULT_TIMEOUT",
      message: getChatMessageDeliveryFailureMessage(event),
    });
  }

  private handleMessageMutationTerminal(event: ChatMessageMutationTerminalEvent): void {
    this.emitMessageMutationLifecycle(createChatMessageMutationTerminalLifecycleEvent(event));

    if (event.kind === "cancelled") {
      return;
    }

    if (event.kind === "completed") {
      this.emitMessageMutationEvent({
        kind: "result",
        roomId: event.snapshot.roomId,
        result: event.result,
      });
      return;
    }

    if (event.result) {
      this.emitMessageMutationEvent({
        kind: "result",
        roomId: event.snapshot.roomId,
        result: event.result,
      });
      return;
    }

    this.emitMessageMutationEvent({
      kind: "failure",
      roomId: event.snapshot.roomId,
      clientMutationId: event.snapshot.request.clientMutationId,
      code: "MUTATION_PUBLISH_FAILED",
      retryable: event.reason === "PUBLISH_FAILED" || event.reason === "COMMAND_RESULT_TIMEOUT",
      message: getChatMessageMutationFailureMessage(event),
    });
  }

  private emitMessageCommandEvent(event: ChatMessageCommandEvent): void {
    this.messageCommandListeners.forEach((listener) => listener(event));
  }

  private emitMessageMutationEvent(event: ChatMessageMutationEvent): void {
    this.messageMutationListeners.forEach((listener) => listener(event));
  }

  private emitMessageMutationLifecycle(event: ChatMessageMutationLifecycleEvent): void {
    this.messageMutationLifecycleListeners.forEach((listener) => listener(event));
  }

  private emitMessageDeliveryLifecycle(event: ChatMessageDeliveryLifecycleEvent): void {
    this.messageDeliveryLifecycleListeners.forEach((listener) => listener(event));
  }

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
        rejection.destination !== getChatRoomEventsDestination(roomId) &&
        rejection.destination !== getChatRoomReadReceiptsDestination(roomId))
    ) {
      return;
    }

    try {
      this.subscriptions.releaseRoom(roomId);
    } catch {
      // The server already rejected the room subscription; keep the rejection as the UI error.
    }
    this.cancelMessageDeliveriesForRoom(roomId, "SUBSCRIPTION_REJECTED");
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

    const event = parseChatMessageEvent(message.body);

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

  private readonly handleRoomReadReceiptEvent = (roomId: string, message: IMessage): void => {
    const generation = this.getCurrentBufferGeneration(roomId);

    if (generation === null) {
      return;
    }

    const event = parseChatRoomReadReceiptEvent(message.body);

    if (!event || event.payload.roomId !== roomId) {
      if (this.realtimeBuffer.recordInvalidReadReceiptEvent(roomId, generation)) {
        this.deliverRealtimeEvents(false);
      }
      return;
    }

    this.bufferRoomReadReceiptEvent(roomId, event);
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

  private bufferRoomReadReceiptEvent(
    roomId: string,
    event: ChatRoomReadReceiptEventEnvelope,
  ): void {
    const generation = this.getCurrentBufferGeneration(roomId);

    if (generation === null) {
      return;
    }

    if (this.realtimeBuffer.appendReadReceipt(roomId, generation, event)) {
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
    this.diagnostics.emit({
      event: "room.sync.requested",
      requestId: pendingSync.requestId,
      roomId,
      generation,
    });

    try {
      this.subscriptions.syncRoomSubscriptions(roomId, pendingSync.requestId);
    } catch (cause) {
      this.pendingRoomSync = null;
      this.diagnostics.emit({
        event: "room.sync.rejected",
        requestId: pendingSync.requestId,
        roomId,
        generation,
        code: "ROOM_SUBSCRIPTION_SYNC_PUBLISH_FAILED",
        retryable: true,
      });
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
    this.diagnostics.emit({
      event: "room.sync.ready",
      requestId: ready.requestId,
      roomId: ready.roomId,
      generation: pendingSync.generation,
      messageVisibleAfterSequence: ready.messageVisibleAfterSequence,
      watermarkSequence: ready.watermarkSequence,
    });
    this.diagnostics.emit({
      event: "room.activated",
      requestId: this.roomClaimRequestId ?? ready.requestId,
      roomId: ready.roomId,
      generation: pendingSync.generation,
    });
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
    this.diagnostics.emit({
      event: "room.sync.rejected",
      requestId: rejection.requestId,
      roomId: rejection.roomId,
      generation: pendingSync.generation,
      code: sanitizeDiagnosticText(rejection.code),
      retryable: rejection.retryable,
    });

    if (rejection.code === "ROOM_SUBSCRIPTION_STALE") {
      this.recoverStaleRoomSubscriptions(rejection.roomId, pendingSync.generation);
      return;
    }

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

  private recoverStaleRoomSubscriptions(roomId: string, previousGeneration: number): void {
    if (
      this.roomSnapshot.roomId !== roomId ||
      this.roomSnapshot.generation !== previousGeneration
    ) {
      return;
    }

    this.cancelMessageDeliveriesForRoom(roomId, "ROOM_SUBSCRIPTION_STALE");
    const generation = previousGeneration + 1;
    this.pauseRealtimeDelivery();
    this.realtimeBuffer.clear(roomId, previousGeneration);
    this.realtimeBuffer.begin(roomId, generation);
    this.setRoomSnapshot({
      status: "claiming",
      roomId,
      generation,
      replacedByRoomId: null,
      messageVisibleAfterSequence: null,
      watermarkSequence: null,
      error: null,
    });

    try {
      this.subscriptions.resubscribeRoom(roomId);
    } catch (cause) {
      this.handleSubscriptionSetupFailure(cause);
      return;
    }

    this.startRoomSync(roomId, generation);
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
        snapshot.invalidEventCount === 0 &&
        snapshot.invalidReadReceiptEventCount === 0)
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

function sanitizeDiagnosticText(value: string): string {
  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim()
    .slice(0, 256);
}
