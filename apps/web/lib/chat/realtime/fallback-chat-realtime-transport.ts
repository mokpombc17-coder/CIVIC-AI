import type {
  ChatConnectionSnapshot,
  ChatMessageCommandEvent,
  ChatMessageMutationEvent,
  ChatRealtimeReconnectReason,
  ChatRealtimeTransport,
  ChatRoomReadStateConfirmation,
  ChatRoomMessageDeleteCommand,
  ChatRoomMessageEditCommand,
  ChatRoomMessageSendCommand,
  ChatRoomSessionSnapshot,
} from "./chat-realtime-transport";
import type { ChatRealtimeEventDelivery } from "./chat-realtime-event-buffer";
import type { ChatMessageDeliveryLifecycleEvent } from "./chat-message-delivery-scheduler";
import type { ChatMessageMutationLifecycleEvent } from "./chat-message-mutation-scheduler";
import type { ChatRoomInboxEvent } from "./chat-stomp-contracts";

export type ChatRealtimeTransportCandidateLifecycle = {
  onReady: () => void;
  onUnavailable: () => void;
};

export type ChatRealtimeTransportCandidate = Readonly<{
  create: (lifecycle: ChatRealtimeTransportCandidateLifecycle) => ChatRealtimeTransport;
  name: "shared-worker" | "leader-tab" | "direct";
}>;

export class FallbackChatRealtimeTransport implements ChatRealtimeTransport {
  private attachmentCount = 0;
  private candidateIndex = -1;
  private readonly candidates: readonly ChatRealtimeTransportCandidate[];
  private delegate: ChatRealtimeTransport;
  private delegateAttachedCleanup: (() => void) | null = null;
  private delegateSubscriptions: (() => void)[] = [];
  private desiredRoomId: string | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly messageCommandListeners = new Set<(event: ChatMessageCommandEvent) => void>();
  private readonly messageMutationListeners = new Set<(event: ChatMessageMutationEvent) => void>();
  private readonly messageDeliveryLifecycleListeners = new Set<
    (event: ChatMessageDeliveryLifecycleEvent) => void
  >();
  private readonly messageMutationLifecycleListeners = new Set<
    (event: ChatMessageMutationLifecycleEvent) => void
  >();
  private readonly realtimeEventDeliveryListeners = new Set<() => void>();
  private readonly principalGenerationListeners = new Set<() => void>();
  private readonly roomListeners = new Set<() => void>();
  private readonly roomInboxEventListeners = new Set<(event: ChatRoomInboxEvent) => void>();
  private readonly roomReadStateConfirmationListeners = new Set<
    (confirmation: ChatRoomReadStateConfirmation) => void
  >();
  private switchScheduled = false;

  constructor(candidates: readonly ChatRealtimeTransportCandidate[]) {
    if (candidates.length === 0) {
      throw new Error("최소 하나의 채팅 실시간 transport 후보가 필요합니다.");
    }

    this.candidates = candidates;
    this.delegate = this.createNextDelegate();
    this.bindDelegate();
  }

  attach(): () => void {
    this.attachmentCount += 1;

    if (this.attachmentCount === 1) {
      this.attachDelegate();
    }

    let attached = true;

    return () => {
      if (!attached) {
        return;
      }

      attached = false;
      this.attachmentCount -= 1;

      if (this.attachmentCount === 0) {
        this.delegateAttachedCleanup?.();
        this.delegateAttachedCleanup = null;
      }
    };
  }

  readonly getSnapshot = (): ChatConnectionSnapshot => this.delegate.getSnapshot();

  readonly getRoomSnapshot = (): ChatRoomSessionSnapshot => this.delegate.getRoomSnapshot();

  readonly getRealtimeEventDelivery = (): ChatRealtimeEventDelivery | null =>
    this.delegate.getRealtimeEventDelivery();

  readonly getPrincipalGeneration = (): number => this.delegate.getPrincipalGeneration();

  readonly getDiagnosticSnapshot = () => this.delegate.getDiagnosticSnapshot();

  readonly clearDiagnostics = () => this.delegate.clearDiagnostics();

  readonly observe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly observeRoom = (listener: () => void): (() => void) => {
    this.roomListeners.add(listener);
    return () => this.roomListeners.delete(listener);
  };

  readonly observeRoomInboxEvent = (
    listener: (event: ChatRoomInboxEvent) => void,
  ): (() => void) => {
    this.roomInboxEventListeners.add(listener);
    return () => this.roomInboxEventListeners.delete(listener);
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
    return () => this.messageCommandListeners.delete(listener);
  };

  readonly observeMessageDeliveryLifecycle = (
    listener: (event: ChatMessageDeliveryLifecycleEvent) => void,
  ): (() => void) => {
    this.messageDeliveryLifecycleListeners.add(listener);
    return () => this.messageDeliveryLifecycleListeners.delete(listener);
  };

  readonly observeMessageMutationEvent = (
    listener: (event: ChatMessageMutationEvent) => void,
  ): (() => void) => {
    this.messageMutationListeners.add(listener);
    return () => this.messageMutationListeners.delete(listener);
  };

  readonly observeMessageMutationLifecycle = (
    listener: (event: ChatMessageMutationLifecycleEvent) => void,
  ): (() => void) => {
    this.messageMutationLifecycleListeners.add(listener);
    return () => this.messageMutationLifecycleListeners.delete(listener);
  };

  readonly observeRealtimeEventDelivery = (listener: () => void): (() => void) => {
    this.realtimeEventDeliveryListeners.add(listener);
    return () => this.realtimeEventDeliveryListeners.delete(listener);
  };

  readonly claimRoom = (roomId: string): void => {
    this.desiredRoomId = roomId;
    this.delegate.claimRoom(roomId);
  };

  readonly releaseRoom = (roomId: string): void => {
    if (this.desiredRoomId === roomId) {
      this.desiredRoomId = null;
    }

    this.delegate.releaseRoom(roomId);
  };

  readonly reconnect = (reason?: ChatRealtimeReconnectReason): void => {
    this.delegate.reconnect(reason);
  };

  readonly confirmRoomReadState = (roomId: string, readThroughSequence: number): void => {
    this.delegate.confirmRoomReadState(roomId, readThroughSequence);
  };

  readonly markRoomSnapshotApplied = (roomId: string, generation: number): void => {
    this.delegate.markRoomSnapshotApplied(roomId, generation);
  };

  readonly acknowledgeRealtimeEventDelivery = (deliveryId: string): void => {
    this.delegate.acknowledgeRealtimeEventDelivery(deliveryId);
  };

  readonly sendRoomMessage = (command: ChatRoomMessageSendCommand): void => {
    this.delegate.sendRoomMessage(command);
  };

  readonly editRoomMessage = (command: ChatRoomMessageEditCommand): void => {
    this.delegate.editRoomMessage(command);
  };

  readonly deleteRoomMessage = (command: ChatRoomMessageDeleteCommand): void => {
    this.delegate.deleteRoomMessage(command);
  };

  private createNextDelegate(): ChatRealtimeTransport {
    let lastError: unknown = null;

    while (this.candidateIndex + 1 < this.candidates.length) {
      this.candidateIndex += 1;
      const candidateIndex = this.candidateIndex;
      const candidate = this.candidates[candidateIndex]!;

      try {
        return candidate.create({
          onReady: () => {},
          onUnavailable: () => {
            if (this.candidateIndex === candidateIndex) {
              this.scheduleFallback();
            }
          },
        });
      } catch (cause) {
        lastError = cause;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("사용 가능한 채팅 실시간 transport를 생성하지 못했습니다.");
  }

  private bindDelegate(): void {
    this.delegateSubscriptions = [
      this.delegate.observe(() => {
        this.listeners.forEach((listener) => listener());
      }),
      this.delegate.observeRoom(() => {
        this.roomListeners.forEach((listener) => listener());
      }),
      this.delegate.observeRoomInboxEvent((event) => {
        this.roomInboxEventListeners.forEach((listener) => listener(event));
      }),
      this.delegate.observePrincipalGeneration(() => {
        this.principalGenerationListeners.forEach((listener) => listener());
      }),
      this.delegate.observeRoomReadStateConfirmation((confirmation) => {
        this.roomReadStateConfirmationListeners.forEach((listener) => listener(confirmation));
      }),
      this.delegate.observeMessageCommandEvent((event) => {
        this.messageCommandListeners.forEach((listener) => listener(event));
      }),
      this.delegate.observeMessageMutationEvent((event) => {
        this.messageMutationListeners.forEach((listener) => listener(event));
      }),
      this.delegate.observeMessageMutationLifecycle((event) => {
        this.messageMutationLifecycleListeners.forEach((listener) => listener(event));
      }),
      this.delegate.observeMessageDeliveryLifecycle((event) => {
        this.messageDeliveryLifecycleListeners.forEach((listener) => listener(event));
      }),
      this.delegate.observeRealtimeEventDelivery(() => {
        this.realtimeEventDeliveryListeners.forEach((listener) => listener());
      }),
    ];
  }

  private attachDelegate(): void {
    try {
      this.delegateAttachedCleanup = this.delegate.attach();
    } catch {
      this.scheduleFallback();
    }
  }

  private scheduleFallback(): void {
    if (this.switchScheduled || this.candidateIndex + 1 >= this.candidates.length) {
      return;
    }

    this.switchScheduled = true;
    queueMicrotask(() => {
      this.switchScheduled = false;
      this.fallback();
    });
  }

  private fallback(): void {
    if (this.candidateIndex + 1 >= this.candidates.length) {
      return;
    }

    this.delegateAttachedCleanup?.();
    this.delegateAttachedCleanup = null;
    this.delegateSubscriptions.forEach((unsubscribe) => unsubscribe());
    this.delegateSubscriptions = [];
    this.delegate = this.createNextDelegate();
    this.bindDelegate();

    if (this.attachmentCount > 0) {
      this.attachDelegate();
    }

    if (this.desiredRoomId) {
      this.delegate.claimRoom(this.desiredRoomId);
    }

    this.listeners.forEach((listener) => listener());
    this.roomListeners.forEach((listener) => listener());
    this.realtimeEventDeliveryListeners.forEach((listener) => listener());
    this.principalGenerationListeners.forEach((listener) => listener());
  }
}
