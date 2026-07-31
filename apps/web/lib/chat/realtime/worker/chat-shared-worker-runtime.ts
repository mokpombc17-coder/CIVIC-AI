import type { Client, IFrame, IMessage } from "@stomp/stompjs";
import {
  ChatMessageDeliveryScheduler,
  createChatMessageDeliveryStateLifecycleEvent,
  createChatMessageDeliveryTerminalLifecycleEvent,
  getChatMessageDeliveryFailureMessage,
  type ChatMessageDeliverySnapshot,
  type ChatMessageDeliveryTerminalEvent,
} from "../chat-message-delivery-scheduler";
import {
  CHAT_CONNECTION_REPLACED_MESSAGE,
  CHAT_ROOM_ACCESS_REVOKED_MESSAGE,
  CHAT_ROOM_CLOSED_MESSAGE,
  isChatConnectionReplacedCloseEvent,
  isChatRoomAccessRevokedCloseEvent,
  isChatRoomClosedCloseEvent,
  type ChatConnectionSnapshot,
  type ChatConnectionStatus,
  type ChatRealtimeError,
} from "../chat-realtime-transport";
import {
  getChatRoomEventsDestination,
  getChatRoomMessagesDestination,
} from "../chat-stomp-destinations";
import {
  parseChatMessageCreatedEvent,
  parseChatMessageCommandResult,
  parseChatMessageMutationCommandResult,
  parseChatRoomEventEnvelope,
  parseChatRoomSubscriptionSyncRejected,
  parseChatRoomSubscriptionsReady,
  parseChatSubscriptionRejection,
  type ChatRoomEventEnvelope,
  type ChatRoomSubscriptionSyncRejected,
  type ChatRoomSubscriptionsReady,
} from "../chat-stomp-contracts";
import {
  ChatRealtimeEventBuffer,
  type ChatRealtimeEventDelivery,
  type ChatRealtimeEventBufferSnapshot,
} from "../chat-realtime-event-buffer";
import { ChatStompSubscriptionManager } from "../chat-stomp-subscription-manager";
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
  | "publish"
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
  requestId: string;
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

type PendingRoomSync = Readonly<{
  requestId: string;
  roomId: string;
  ownerPortId: string;
  generation: number;
}>;

type RealtimeDeliverySession = Readonly<{
  roomId: string;
  ownerPortId: string;
  generation: number;
}>;

type PendingRealtimeDelivery = ChatRealtimeEventDelivery &
  Readonly<{
    ownerPortId: string;
  }>;

type PendingMessageMutation = Readonly<{
  commandType: "EDIT_MESSAGE" | "DELETE_MESSAGE";
  ownerPortId: string;
  roomId: string;
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
  private readonly messageDeliveries: ChatMessageDeliveryScheduler;
  private readonly pendingMessageMutations = new Map<string, PendingMessageMutation>();
  private pendingRoomActivation: PendingRoomActivation | null = null;
  private pendingRoomSync: PendingRoomSync | null = null;
  private pendingRealtimeDelivery: PendingRealtimeDelivery | null = null;
  private readonly ports = new Map<ChatSharedWorkerPort, ConnectedPort>();
  private readyRoomSession: RealtimeDeliverySession | null = null;
  private realtimeDeliverySession: RealtimeDeliverySession | null = null;
  private snapshot: ChatConnectionSnapshot = INITIAL_SNAPSHOT;
  private readonly subscriptions: ChatStompSubscriptionManager;

  constructor(
    private readonly client: ChatSharedWorkerStompClient,
    private readonly workerInstanceId = crypto.randomUUID(),
    private readonly createId = () => crypto.randomUUID(),
    private readonly realtimeBuffer = new ChatRealtimeEventBuffer(),
  ) {
    this.subscriptions = new ChatStompSubscriptionManager(this.client, {
      onCommandResult: this.handleMessageCommandResult,
      onRoomEvent: this.handleRoomEvent,
      onRoomMessage: this.handleRoomMessage,
      onSystemEvent: this.handleSystemEvent,
    });
    this.messageDeliveries = new ChatMessageDeliveryScheduler({
      isContextCurrent: (snapshot) => this.isMessageDeliveryContextCurrent(snapshot),
      onStateChange: (snapshot) => {
        this.sendToPort(snapshot.ownerId, {
          type: "ROOM_MESSAGE_DELIVERY_LIFECYCLE",
          event: createChatMessageDeliveryStateLifecycleEvent(snapshot),
        });
      },
      onTerminal: (event) => this.handleMessageDeliveryTerminal(event),
      publish: ({ request, roomId }) => {
        this.subscriptions.sendRoomMessage(roomId, request);
      },
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
      this.pendingRoomSync = null;
      this.pendingMessageMutations.clear();
      this.pauseRealtimeDelivery();
      this.messageDeliveries.cancelAll("WEBSOCKET_CLOSED");

      if (isChatConnectionReplacedCloseEvent(event)) {
        this.stopConnectionReplacedReconnect();
        return;
      }

      if (isChatRoomAccessRevokedCloseEvent(event)) {
        this.restartAfterRoomAccessRevoked();
        return;
      }

      if (isChatRoomClosedCloseEvent(event)) {
        this.restartAfterRoomClosed();
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

  getRealtimeBufferSnapshot(): ChatRealtimeEventBufferSnapshot | null {
    return this.realtimeBuffer.getSnapshot();
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
        return;
      case "SEND_ROOM_MESSAGE":
        if (connectedPort.attached && connectedPort.portId === command.portId) {
          this.sendRoomMessage(connectedPort, command);
        }
        return;
      case "EDIT_ROOM_MESSAGE":
      case "DELETE_ROOM_MESSAGE":
        if (connectedPort.attached && connectedPort.portId === command.portId) {
          this.mutateRoomMessage(connectedPort, command);
        }
        return;
      case "ROOM_SNAPSHOT_APPLIED":
        if (connectedPort.attached && connectedPort.portId === command.portId) {
          this.markRoomSnapshotApplied(connectedPort, command);
        }
        return;
      case "ROOM_EVENTS_APPLIED":
        if (connectedPort.attached && connectedPort.portId === command.portId) {
          this.acknowledgeRealtimeEvents(connectedPort, command);
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
    const portId = connectedPort.portId;

    this.cancelMessageDeliveriesForPort(portId, "OWNER_PORT_DETACHED");
    this.clearPendingMessageMutationsForPort(portId);

    if (lease && portId === lease.ownerPortId) {
      this.tryReleaseRoom(lease.roomId);
      this.realtimeBuffer.clear(lease.roomId, lease.generation);
      this.pauseRealtimeDelivery();
      this.generation += 1;
      this.activeRoomLease = null;
      this.pendingRoomActivation = null;
      this.pendingRoomSync = null;
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

    this.messageDeliveries.cancelAll("TRANSPORT_STOPPED");
    this.pendingMessageMutations.clear();
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

    this.messageDeliveries.cancelAll("TRANSPORT_RECONNECTING");

    if (this.client.active) {
      this.subscriptions.disconnect();
      this.setSnapshot("reconnecting", null);
      this.client.forceDisconnect();
      return;
    }

    this.startConnection();
  }

  private stopConnectionReplacedReconnect(): void {
    this.messageDeliveries.cancelAll("CONNECTION_REPLACED");
    this.pendingRoomActivation = null;
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

  private restartAfterRoomAccessRevoked(): void {
    const lease = this.activeRoomLease;

    if (lease) {
      const refreshedLease: ActiveRoomLease = {
        ...lease,
        generation: lease.generation + 1,
      };
      this.generation = refreshedLease.generation;
      this.activeRoomLease = refreshedLease;
      this.pendingRoomActivation = refreshedLease;
      this.realtimeBuffer.clear(lease.roomId, lease.generation);
      this.realtimeBuffer.begin(refreshedLease.roomId, refreshedLease.generation);
    }

    this.setSnapshot("reconnecting", {
      source: "websocket",
      code: "ROOM_ACCESS_REVOKED",
      message: CHAT_ROOM_ACCESS_REVOKED_MESSAGE,
    });
    this.stopConnection();
  }

  private restartAfterRoomClosed(): void {
    const lease = this.activeRoomLease;

    if (lease) {
      this.cancelMessageDeliveriesForLease(lease, "SUBSCRIPTION_SETUP_FAILED");
      this.tryReleaseRoom(lease.roomId);
      this.realtimeBuffer.clear(lease.roomId, lease.generation);
      this.generation = lease.generation + 1;
      this.activeRoomLease = null;
      this.sendToPort(lease.ownerPortId, {
        type: "ROOM_SUBSCRIPTION_FAILED",
        roomId: lease.roomId,
        generation: this.generation,
        code: "ROOM_CLOSED",
        message: CHAT_ROOM_CLOSED_MESSAGE,
      });
    }

    this.pendingRoomActivation = null;
    this.pendingRoomSync = null;
    this.pauseRealtimeDelivery();
    this.setSnapshot("reconnecting", {
      source: "websocket",
      code: "ROOM_CLOSED",
      message: CHAT_ROOM_CLOSED_MESSAGE,
    });
    this.stopConnection();
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
    this.pauseRealtimeDelivery();

    if (previousLease?.roomId === command.roomId && previousLease.ownerPortId === portId) {
      const nextLease = {
        ...previousLease,
        requestId: command.requestId,
      };
      this.activeRoomLease = nextLease;
      this.pendingRoomActivation = {
        requestId: command.requestId,
        roomId: command.roomId,
        ownerPortId: portId,
        generation: previousLease.generation,
      };
      this.activatePendingRoom();
      return;
    }

    if (previousLease) {
      this.cancelMessageDeliveriesForLease(previousLease, "ROOM_LEASE_REPLACED");
      this.clearPendingMessageMutationsForLease(previousLease);
    }

    this.generation += 1;
    const nextLease: ActiveRoomLease = {
      requestId: command.requestId,
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
    this.pendingRoomSync = null;
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

    if (ownsLease && lease) {
      this.cancelMessageDeliveriesForLease(lease, "ROOM_RELEASED");
      this.clearPendingMessageMutationsForLease(lease);
      this.tryReleaseRoom(command.roomId);
      this.realtimeBuffer.clear(lease.roomId, lease.generation);
      this.pauseRealtimeDelivery();
      this.generation += 1;
      this.activeRoomLease = null;
      this.pendingRoomActivation = null;
      this.pendingRoomSync = null;
    }

    connectedPort.port.postMessage({
      type: "ROOM_RELEASED",
      requestId: command.requestId,
      roomId: command.roomId,
      generation: this.generation,
    });
  }

  private sendRoomMessage(
    connectedPort: ConnectedPort,
    command: Extract<ChatSharedWorkerCommand, { type: "SEND_ROOM_MESSAGE" }>,
  ): void {
    const lease = this.activeRoomLease;
    const deliverySession = this.realtimeDeliverySession;
    const portId = connectedPort.portId;

    if (this.snapshot.status !== "connected") {
      this.sendMessageFailure(
        portId,
        command.roomId,
        command.request.clientMessageId,
        "CONNECTION_NOT_READY",
        true,
        "WebSocket 연결이 준비되지 않아 메시지를 전송할 수 없습니다.",
      );
      return;
    }

    if (
      !portId ||
      !lease ||
      !deliverySession ||
      lease.ownerPortId !== portId ||
      lease.roomId !== command.roomId ||
      deliverySession.ownerPortId !== portId ||
      deliverySession.roomId !== command.roomId ||
      deliverySession.generation !== lease.generation
    ) {
      this.sendMessageFailure(
        portId,
        command.roomId,
        command.request.clientMessageId,
        "ROOM_NOT_ACTIVE",
        true,
        "현재 탭의 채팅방 동기화가 완료되지 않아 메시지를 전송할 수 없습니다.",
      );
      return;
    }

    try {
      this.messageDeliveries.start({
        generation: lease.generation,
        ownerId: portId,
        request: command.request,
        roomId: command.roomId,
      });
    } catch (cause) {
      this.sendMessageFailure(
        portId,
        command.roomId,
        command.request.clientMessageId,
        "MESSAGE_PUBLISH_FAILED",
        true,
        cause instanceof Error && cause.message.trim()
          ? cause.message
          : "STOMP 메시지 전송에 실패했습니다.",
      );
    }
  }

  private mutateRoomMessage(
    connectedPort: ConnectedPort,
    command: Extract<
      ChatSharedWorkerCommand,
      { type: "EDIT_ROOM_MESSAGE" | "DELETE_ROOM_MESSAGE" }
    >,
  ): void {
    const lease = this.activeRoomLease;
    const deliverySession = this.realtimeDeliverySession;
    const portId = connectedPort.portId;
    const clientMutationId = command.request.clientMutationId;

    if (this.snapshot.status !== "connected") {
      this.sendMessageMutationFailure(
        portId,
        command.roomId,
        clientMutationId,
        "CONNECTION_NOT_READY",
        true,
        "WebSocket 연결이 준비되지 않아 메시지를 변경할 수 없습니다.",
      );
      return;
    }

    if (
      !portId ||
      !lease ||
      !deliverySession ||
      lease.ownerPortId !== portId ||
      lease.roomId !== command.roomId ||
      deliverySession.ownerPortId !== portId ||
      deliverySession.roomId !== command.roomId ||
      deliverySession.generation !== lease.generation
    ) {
      this.sendMessageMutationFailure(
        portId,
        command.roomId,
        clientMutationId,
        "ROOM_NOT_ACTIVE",
        true,
        "현재 탭의 채팅방 동기화가 완료되지 않아 메시지를 변경할 수 없습니다.",
      );
      return;
    }

    this.pendingMessageMutations.set(clientMutationId, {
      commandType: command.type === "EDIT_ROOM_MESSAGE" ? "EDIT_MESSAGE" : "DELETE_MESSAGE",
      ownerPortId: portId,
      roomId: command.roomId,
    });

    try {
      if (command.type === "EDIT_ROOM_MESSAGE") {
        this.subscriptions.editRoomMessage(command.roomId, command.request);
      } else {
        this.subscriptions.deleteRoomMessage(command.roomId, command.request);
      }
    } catch (cause) {
      this.pendingMessageMutations.delete(clientMutationId);
      this.sendMessageMutationFailure(
        portId,
        command.roomId,
        clientMutationId,
        "MUTATION_PUBLISH_FAILED",
        true,
        cause instanceof Error && cause.message.trim()
          ? cause.message
          : "STOMP 메시지 변경 요청 전송에 실패했습니다.",
      );
    }
  }

  private handleConnected(): void {
    if (this.getAttachedPortCount() === 0) {
      return;
    }

    const lease = this.activeRoomLease;

    if (lease) {
      this.realtimeBuffer.begin(lease.roomId, lease.generation);
    }

    try {
      this.subscriptions.connect();
    } catch (cause) {
      this.handleSubscriptionSetupFailure(cause);
      return;
    }

    this.setSnapshot("connected", null);

    if (lease) {
      this.startRoomSync(lease);
    }
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

    this.realtimeBuffer.begin(lease.roomId, lease.generation);

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
    this.startRoomSync(lease);
  }

  private startRoomSync(lease: ActiveRoomLease): void {
    if (
      !this.subscriptions.connected ||
      this.subscriptions.activeRoomId !== lease.roomId ||
      this.activeRoomLease !== lease
    ) {
      return;
    }

    this.pauseRealtimeDelivery();
    const pendingSync: PendingRoomSync = {
      requestId: this.createId(),
      roomId: lease.roomId,
      ownerPortId: lease.ownerPortId,
      generation: lease.generation,
    };
    this.pendingRoomSync = pendingSync;
    this.sendToPort(lease.ownerPortId, {
      type: "ROOM_SYNCING",
      roomId: lease.roomId,
      generation: lease.generation,
    });

    try {
      this.subscriptions.syncRoomSubscriptions(lease.roomId, pendingSync.requestId);
    } catch (cause) {
      this.pendingRoomSync = null;
      this.handleRoomSyncFailure(
        lease,
        "ROOM_SUBSCRIPTION_SYNC_PUBLISH_FAILED",
        true,
        cause instanceof Error && cause.message.trim()
          ? cause.message
          : "채팅방 구독 준비 sync 요청을 전송하지 못했습니다.",
      );
    }
  }

  private completePendingRoomActivation(ready: ChatRoomSubscriptionsReady): void {
    const pendingActivation = this.pendingRoomActivation;
    const pendingSync = this.pendingRoomSync;
    const lease = this.activeRoomLease;

    if (
      !pendingSync ||
      !lease ||
      this.subscriptions.activeRoomId !== lease.roomId ||
      pendingSync.requestId !== ready.requestId ||
      pendingSync.roomId !== ready.roomId ||
      pendingSync.generation !== lease.generation ||
      pendingSync.ownerPortId !== lease.ownerPortId ||
      pendingSync.roomId !== lease.roomId
    ) {
      return;
    }

    if (
      pendingActivation &&
      pendingActivation.generation === lease.generation &&
      pendingActivation.ownerPortId === lease.ownerPortId &&
      pendingActivation.roomId === lease.roomId
    ) {
      this.pendingRoomActivation = null;
    }
    this.pendingRoomSync = null;
    this.readyRoomSession = {
      roomId: lease.roomId,
      ownerPortId: lease.ownerPortId,
      generation: lease.generation,
    };
    this.sendToPort(lease.ownerPortId, {
      type: "ROOM_ACTIVATED",
      requestId: lease.requestId,
      roomId: lease.roomId,
      generation: lease.generation,
      messageVisibleAfterSequence: ready.messageVisibleAfterSequence,
      watermarkSequence: ready.watermarkSequence,
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

  private markRoomSnapshotApplied(
    connectedPort: ConnectedPort,
    command: Extract<ChatSharedWorkerCommand, { type: "ROOM_SNAPSHOT_APPLIED" }>,
  ): void {
    const lease = this.activeRoomLease;
    const readySession = this.readyRoomSession;

    if (
      !lease ||
      !readySession ||
      !connectedPort.portId ||
      lease.ownerPortId !== connectedPort.portId ||
      lease.roomId !== command.roomId ||
      lease.generation !== command.generation ||
      readySession.ownerPortId !== lease.ownerPortId ||
      readySession.roomId !== lease.roomId ||
      readySession.generation !== lease.generation ||
      this.pendingRoomActivation ||
      this.pendingRoomSync ||
      this.subscriptions.activeRoomId !== lease.roomId
    ) {
      return;
    }

    this.realtimeDeliverySession = {
      roomId: lease.roomId,
      ownerPortId: lease.ownerPortId,
      generation: lease.generation,
    };
    this.deliverRealtimeEvents(true);
  }

  private acknowledgeRealtimeEvents(
    connectedPort: ConnectedPort,
    command: Extract<ChatSharedWorkerCommand, { type: "ROOM_EVENTS_APPLIED" }>,
  ): void {
    const pending = this.pendingRealtimeDelivery;

    if (
      !pending ||
      connectedPort.portId !== pending.ownerPortId ||
      command.deliveryId !== pending.deliveryId ||
      command.roomId !== pending.roomId ||
      command.generation !== pending.generation
    ) {
      return;
    }

    const acknowledged = this.realtimeBuffer.acknowledge(
      pending.roomId,
      pending.generation,
      pending.throughBufferSequence,
      pending.invalidEventCount,
    );

    if (!acknowledged) {
      return;
    }

    this.pendingRealtimeDelivery = null;
    this.deliverRealtimeEvents(false);
  }

  private deliverRealtimeEvents(force: boolean): void {
    const session = this.realtimeDeliverySession;
    const lease = this.activeRoomLease;

    if (
      !session ||
      !lease ||
      this.pendingRealtimeDelivery ||
      session.roomId !== lease.roomId ||
      session.ownerPortId !== lease.ownerPortId ||
      session.generation !== lease.generation
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

    const delivery: PendingRealtimeDelivery = {
      ...snapshot,
      deliveryId: this.createId(),
      ownerPortId: session.ownerPortId,
    };
    this.pendingRealtimeDelivery = delivery;
    this.sendToPort(session.ownerPortId, {
      type: "ROOM_EVENTS_DELIVERED",
      deliveryId: delivery.deliveryId,
      roomId: delivery.roomId,
      generation: delivery.generation,
      events: delivery.events,
      throughBufferSequence: delivery.throughBufferSequence,
      overflowed: delivery.overflowed,
      invalidEventCount: delivery.invalidEventCount,
    });
  }

  private pauseRealtimeDelivery(): void {
    this.readyRoomSession = null;
    this.realtimeDeliverySession = null;
    this.pendingRealtimeDelivery = null;
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
      this.realtimeBuffer.clear(lease.roomId, lease.generation);
    }
    this.pauseRealtimeDelivery();
    this.pendingRoomActivation = null;
    this.pendingRoomSync = null;

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

  private handleRoomSyncFailure(
    lease: ActiveRoomLease,
    code: string,
    retryable: boolean,
    message: string,
  ): void {
    const currentLease = this.activeRoomLease;

    if (
      !currentLease ||
      currentLease.generation !== lease.generation ||
      currentLease.ownerPortId !== lease.ownerPortId ||
      currentLease.roomId !== lease.roomId
    ) {
      return;
    }

    this.pendingRoomActivation = null;
    this.sendToPort(lease.ownerPortId, {
      type: "ROOM_SYNC_FAILED",
      requestId: lease.requestId,
      roomId: lease.roomId,
      generation: lease.generation,
      code,
      retryable,
      message,
    });
  }

  private readonly handleSystemEvent = (message: IMessage): void => {
    const ready = parseChatRoomSubscriptionsReady(message.body);

    if (ready) {
      this.completePendingRoomActivation(ready);
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
    const lease = this.activeRoomLease;

    if (
      !rejection ||
      !lease ||
      (rejection.destination !== getChatRoomMessagesDestination(lease.roomId) &&
        rejection.destination !== getChatRoomEventsDestination(lease.roomId))
    ) {
      return;
    }

    this.cancelMessageDeliveriesForLease(lease, "ROOM_SUBSCRIPTION_REJECTED");
    this.tryReleaseRoom(lease.roomId);
    this.realtimeBuffer.clear(lease.roomId, lease.generation);
    this.pauseRealtimeDelivery();
    this.pendingRoomActivation = null;
    this.pendingRoomSync = null;
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

    const pending = this.pendingMessageMutations.get(mutationResult.clientMutationId);

    if (!pending) {
      return;
    }

    this.pendingMessageMutations.delete(mutationResult.clientMutationId);

    if (pending.commandType !== mutationResult.commandType) {
      return;
    }

    this.sendToPort(pending.ownerPortId, {
      type: "ROOM_MESSAGE_MUTATION_RESULT",
      roomId: pending.roomId,
      result: mutationResult,
    });
  };

  private readonly handleRoomMessage = (roomId: string, message: IMessage): void => {
    const lease = this.getCurrentBufferLease(roomId);

    if (!lease) {
      return;
    }

    const event = parseChatMessageCreatedEvent(message.body);

    if (!event) {
      if (this.realtimeBuffer.recordInvalidEvent(roomId, lease.generation)) {
        this.deliverRealtimeEvents(false);
      }
      return;
    }

    if (this.realtimeBuffer.appendMessage(roomId, lease.generation, event)) {
      this.deliverRealtimeEvents(false);
    }
  };

  private readonly handleRoomEvent = (roomId: string, message: IMessage): void => {
    const event = parseChatRoomEventEnvelope(message.body);

    if (!event) {
      const lease = this.getCurrentBufferLease(roomId);

      if (lease) {
        if (this.realtimeBuffer.recordInvalidEvent(roomId, lease.generation)) {
          this.deliverRealtimeEvents(false);
        }
      }
      return;
    }

    this.bufferRoomEvent(roomId, event);
  };

  private bufferRoomEvent(roomId: string, event: ChatRoomEventEnvelope): void {
    const lease = this.getCurrentBufferLease(roomId);

    if (!lease) {
      return;
    }

    if (this.realtimeBuffer.appendRoomEvent(roomId, lease.generation, event)) {
      this.deliverRealtimeEvents(false);
    }
  }

  private getCurrentBufferLease(roomId: string): ActiveRoomLease | null {
    const lease = this.activeRoomLease;

    return lease?.roomId === roomId ? lease : null;
  }

  private handleRoomSyncRejection(rejection: ChatRoomSubscriptionSyncRejected): void {
    const pendingSync = this.pendingRoomSync;
    const lease = this.activeRoomLease;

    if (
      !pendingSync ||
      !lease ||
      pendingSync.requestId !== rejection.requestId ||
      pendingSync.roomId !== rejection.roomId ||
      pendingSync.generation !== lease.generation ||
      pendingSync.ownerPortId !== lease.ownerPortId ||
      pendingSync.roomId !== lease.roomId
    ) {
      return;
    }

    this.pendingRoomSync = null;

    if (rejection.code === "ROOM_SUBSCRIPTION_STALE") {
      this.recoverStaleRoomSubscriptions(lease);
      return;
    }

    this.handleRoomSyncFailure(
      lease,
      rejection.code,
      rejection.retryable,
      rejection.retryable
        ? "채팅방 구독 준비 확인에 일시적으로 실패했습니다. 이 탭에서 다시 활성화해 주세요."
        : "채팅방 구독 준비가 거절되었습니다. 방 구독 상태와 권한을 확인해 주세요.",
    );
  }

  private recoverStaleRoomSubscriptions(lease: ActiveRoomLease): void {
    if (this.activeRoomLease !== lease) {
      return;
    }

    this.cancelMessageDeliveriesForLease(lease, "ROOM_SUBSCRIPTION_STALE");
    const refreshedLease: ActiveRoomLease = {
      ...lease,
      generation: lease.generation + 1,
    };
    this.generation = refreshedLease.generation;
    this.activeRoomLease = refreshedLease;
    this.pendingRoomActivation = refreshedLease;
    this.readyRoomSession = null;
    this.pauseRealtimeDelivery();
    this.realtimeBuffer.clear(lease.roomId, lease.generation);
    this.realtimeBuffer.begin(refreshedLease.roomId, refreshedLease.generation);

    try {
      this.subscriptions.resubscribeRoom(refreshedLease.roomId);
    } catch (cause) {
      this.handleSubscriptionSetupFailure(cause);
      return;
    }

    this.startRoomSync(refreshedLease);
  }

  private sendToPort(portId: string, event: ChatSharedWorkerEvent): void {
    for (const connectedPort of this.ports.values()) {
      if (connectedPort.attached && connectedPort.portId === portId) {
        connectedPort.port.postMessage(event);
        return;
      }
    }
  }

  private sendMessageFailure(
    portId: string | null,
    roomId: string,
    clientMessageId: string,
    code: "CONNECTION_NOT_READY" | "ROOM_NOT_ACTIVE" | "MESSAGE_PUBLISH_FAILED",
    retryable: boolean,
    message: string,
  ): void {
    if (!portId) {
      return;
    }

    this.sendToPort(portId, {
      type: "ROOM_MESSAGE_SEND_FAILED",
      roomId,
      clientMessageId,
      code,
      retryable,
      message,
    });
  }

  private sendMessageMutationFailure(
    portId: string | null,
    roomId: string,
    clientMutationId: string,
    code: "CONNECTION_NOT_READY" | "ROOM_NOT_ACTIVE" | "MUTATION_PUBLISH_FAILED",
    retryable: boolean,
    message: string,
  ): void {
    if (!portId) {
      return;
    }

    this.sendToPort(portId, {
      type: "ROOM_MESSAGE_MUTATION_FAILED",
      roomId,
      clientMutationId,
      code,
      retryable,
      message,
    });
  }

  private cancelMessageDeliveriesForPort(portId: string | null, reason: string): void {
    if (!portId) {
      return;
    }

    this.messageDeliveries.cancelMatching(({ ownerId }) => ownerId === portId, reason);
  }

  private cancelMessageDeliveriesForLease(lease: ActiveRoomLease, reason: string): void {
    this.messageDeliveries.cancelMatching(
      ({ generation, ownerId, roomId }) =>
        generation === lease.generation && ownerId === lease.ownerPortId && roomId === lease.roomId,
      reason,
    );
  }

  private clearPendingMessageMutationsForPort(portId: string | null): void {
    if (!portId) {
      return;
    }

    for (const [clientMutationId, pending] of this.pendingMessageMutations) {
      if (pending.ownerPortId === portId) {
        this.pendingMessageMutations.delete(clientMutationId);
      }
    }
  }

  private clearPendingMessageMutationsForLease(lease: ActiveRoomLease): void {
    for (const [clientMutationId, pending] of this.pendingMessageMutations) {
      if (pending.ownerPortId === lease.ownerPortId && pending.roomId === lease.roomId) {
        this.pendingMessageMutations.delete(clientMutationId);
      }
    }
  }

  private isMessageDeliveryContextCurrent(snapshot: ChatMessageDeliverySnapshot): boolean {
    const lease = this.activeRoomLease;
    const deliverySession = this.realtimeDeliverySession;

    return (
      this.snapshot.status === "connected" &&
      this.subscriptions.connected &&
      this.subscriptions.activeRoomId === snapshot.roomId &&
      lease?.ownerPortId === snapshot.ownerId &&
      lease.roomId === snapshot.roomId &&
      lease.generation === snapshot.generation &&
      deliverySession?.ownerPortId === snapshot.ownerId &&
      deliverySession.roomId === snapshot.roomId &&
      deliverySession.generation === snapshot.generation
    );
  }

  private handleMessageDeliveryTerminal(event: ChatMessageDeliveryTerminalEvent): void {
    this.sendToPort(event.snapshot.ownerId, {
      type: "ROOM_MESSAGE_DELIVERY_LIFECYCLE",
      event: createChatMessageDeliveryTerminalLifecycleEvent(event),
    });

    if (event.kind === "cancelled") {
      return;
    }

    if (event.kind === "sent") {
      this.sendToPort(event.snapshot.ownerId, {
        type: "ROOM_MESSAGE_COMMAND_RESULT",
        roomId: event.snapshot.roomId,
        result: event.result,
      });
      return;
    }

    if (event.result) {
      this.sendToPort(event.snapshot.ownerId, {
        type: "ROOM_MESSAGE_COMMAND_RESULT",
        roomId: event.snapshot.roomId,
        result: event.result,
      });
      return;
    }

    this.sendMessageFailure(
      event.snapshot.ownerId,
      event.snapshot.roomId,
      event.snapshot.request.clientMessageId,
      "MESSAGE_PUBLISH_FAILED",
      event.reason === "PUBLISH_FAILED" || event.reason === "COMMAND_RESULT_TIMEOUT",
      getChatMessageDeliveryFailureMessage(event),
    );
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
