import type { QueryClient } from "@tanstack/react-query";
import { chatRoomApi, type ChatRoomApi } from "../chat-room-api";
import { DEFAULT_MESSAGE_HISTORY_LIMIT, chatRoomQueryKeys } from "../chat-room-queries";
import { mergeChatMessages, type ChatMessageMergeResult } from "../chat-message-merge";
import {
  getLastContiguousMessageSequence,
  mergeMessagesIntoChatHistory,
  recoverChatMessageHistory,
  type ChatMessageHistoryData,
  type ChatMessageRecoveryResult,
} from "./chat-message-recovery";
import type { ChatRealtimeEventDelivery } from "./chat-realtime-event-buffer";
import {
  applyChatRoomEventCacheProjection,
  createChatRoomEventCacheProjection,
} from "./chat-room-event-cache-projector";
import type { ChatRoomEventEnvelope } from "./chat-stomp-contracts";
import type { ChatRealtimeTransport } from "./chat-realtime-transport";

export type ChatRoomEventJournal = Readonly<{
  roomId: string;
  events: readonly ChatRoomEventEnvelope[];
}>;

export type ApplyChatRealtimeDeliveryResult = Readonly<{
  deliveryId: string;
  messageCount: number;
  roomEventCount: number;
  messageMerge: ChatMessageMergeResult;
}>;

export type ChatRealtimeQueryCoordinatorTransport = Pick<
  ChatRealtimeTransport,
  | "acknowledgeRealtimeEventDelivery"
  | "getRealtimeEventDelivery"
  | "markRoomSnapshotApplied"
  | "observeRealtimeEventDelivery"
>;

export type ChatRealtimeQueryCoordinatorOptions = Readonly<{
  api?: Pick<ChatRoomApi, "getRoomMessages">;
  roomId: string;
  generation: number;
  limit?: number;
  onApplied?: (result: ApplyChatRealtimeDeliveryResult) => void;
  onError?: (error: unknown) => void;
  onRecovered?: (result: ChatMessageRecoveryResult) => void;
  watermarkSequence?: number;
}>;

export class ChatRealtimeQueryCoordinatorError extends Error {
  override readonly name = "ChatRealtimeQueryCoordinatorError";

  constructor(
    readonly code:
      | "MESSAGE_HISTORY_NOT_READY"
      | "BUFFER_OVERFLOW"
      | "INVALID_REALTIME_EVENT"
      | "MESSAGE_SEQUENCE_GAP"
      | "ROOM_EVENT_JOURNAL_MISMATCH"
      | "ROOM_EVENT_CONFLICT",
    message: string,
  ) {
    super(message);
  }
}

export class ChatRealtimeQueryCoordinator {
  private recovery: Promise<ChatMessageRecoveryResult> | null = null;
  private roomSnapshotApplied = false;
  private stopped = true;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly queryClient: QueryClient,
    private readonly transport: ChatRealtimeQueryCoordinatorTransport,
    private readonly options: ChatRealtimeQueryCoordinatorOptions,
  ) {}

  start(): void {
    if (this.unsubscribe) {
      return;
    }

    this.stopped = false;
    this.unsubscribe = this.transport.observeRealtimeEventDelivery(
      this.handleRealtimeEventDelivery,
    );
    this.handleRealtimeEventDelivery();
  }

  stop(): void {
    this.stopped = true;
    this.roomSnapshotApplied = false;
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  notifyRoomSnapshotApplied(): void {
    if (this.roomSnapshotApplied || this.recovery) {
      return;
    }

    const { generation, roomId } = this.options;
    const history = requireMessageHistory(
      this.queryClient,
      roomId,
      this.options.limit ?? DEFAULT_MESSAGE_HISTORY_LIMIT,
    );
    const watermarkSequence = this.options.watermarkSequence ?? 0;
    const lastContiguousSequence = getLastContiguousMessageSequence(roomId, history);

    if (lastContiguousSequence >= watermarkSequence) {
      this.completeRoomSnapshot(roomId, generation);
      return;
    }

    this.startRecovery(watermarkSequence, () => {
      this.completeRoomSnapshot(roomId, generation);
    });
  }

  retryPendingDelivery(): void {
    if (!this.roomSnapshotApplied) {
      this.notifyRoomSnapshotApplied();
      return;
    }

    this.handleRealtimeEventDelivery();
  }

  private readonly handleRealtimeEventDelivery = (): void => {
    const delivery = this.transport.getRealtimeEventDelivery();

    if (
      !delivery ||
      delivery.roomId !== this.options.roomId ||
      delivery.generation !== this.options.generation
    ) {
      return;
    }

    try {
      const result = applyChatRealtimeEventDelivery(
        this.queryClient,
        delivery,
        this.options.limit ?? DEFAULT_MESSAGE_HISTORY_LIMIT,
      );
      this.transport.acknowledgeRealtimeEventDelivery(delivery.deliveryId);
      this.options.onApplied?.(result);
    } catch (error) {
      if (
        error instanceof ChatRealtimeQueryCoordinatorError &&
        error.code === "MESSAGE_SEQUENCE_GAP"
      ) {
        const throughSequence = getDeliveryRecoveryTarget(
          this.queryClient,
          delivery,
          this.options.limit ?? DEFAULT_MESSAGE_HISTORY_LIMIT,
        );

        this.startRecovery(throughSequence, this.handleRealtimeEventDelivery);
        return;
      }

      this.options.onError?.(error);
    }
  };

  private completeRoomSnapshot(roomId: string, generation: number): void {
    if (this.stopped) {
      return;
    }

    this.roomSnapshotApplied = true;
    this.transport.markRoomSnapshotApplied(roomId, generation);
  }

  private startRecovery(throughSequence: number, onRecovered: () => void): void {
    if (this.recovery || this.stopped) {
      return;
    }

    const operation = recoverChatMessageHistory(this.queryClient, {
      api: this.options.api ?? chatRoomApi,
      limit: this.options.limit ?? DEFAULT_MESSAGE_HISTORY_LIMIT,
      roomId: this.options.roomId,
      throughSequence,
    });
    this.recovery = operation;

    void operation.then(
      (result) => {
        if (this.recovery !== operation) {
          return;
        }

        this.recovery = null;

        if (this.stopped) {
          return;
        }

        this.options.onRecovered?.(result);
        onRecovered();
      },
      (error: unknown) => {
        if (this.recovery === operation) {
          this.recovery = null;
        }

        if (!this.stopped) {
          this.options.onError?.(error);
        }
      },
    );
  }
}

export function applyChatRealtimeEventDelivery(
  queryClient: QueryClient,
  delivery: ChatRealtimeEventDelivery,
  limit = DEFAULT_MESSAGE_HISTORY_LIMIT,
): ApplyChatRealtimeDeliveryResult {
  if (delivery.overflowed) {
    throw new ChatRealtimeQueryCoordinatorError(
      "BUFFER_OVERFLOW",
      `채팅방 ${delivery.roomId}의 실시간 버퍼가 넘쳐 REST 누락 복구가 필요합니다.`,
    );
  }

  if (delivery.invalidEventCount > 0) {
    throw new ChatRealtimeQueryCoordinatorError(
      "INVALID_REALTIME_EVENT",
      `채팅방 ${delivery.roomId}에서 검증하지 못한 실시간 이벤트 ${delivery.invalidEventCount}개를 수신했습니다.`,
    );
  }

  const messageHistoryKey = chatRoomQueryKeys.messageHistory(delivery.roomId, limit);
  const currentHistory = requireMessageHistory(queryClient, delivery.roomId, limit);
  const messageEvents = delivery.events.filter((event) => event.kind === "message");
  const roomEvents = delivery.events.filter((event) => event.kind === "room");
  const { history: nextHistory, merge: messageMerge } = mergeMessagesIntoChatHistory(
    delivery.roomId,
    currentHistory,
    messageEvents.map((event) => event.event.payload),
  );
  const roomEventJournalKey = chatRoomQueryKeys.roomEventJournal(delivery.roomId);
  const currentRoomEventJournal =
    queryClient.getQueryData<ChatRoomEventJournal>(roomEventJournalKey);
  const roomEventJournalMerge = mergeRoomEventJournal(
    delivery.roomId,
    currentRoomEventJournal,
    roomEvents.map((event) => event.event),
  );
  const roomEventProjection = createChatRoomEventCacheProjection(
    queryClient,
    delivery.roomId,
    roomEventJournalMerge.addedEvents,
  );

  if (messageMerge.gaps.length > 0) {
    throw new ChatRealtimeQueryCoordinatorError(
      "MESSAGE_SEQUENCE_GAP",
      `채팅방 ${delivery.roomId} 메시지에 ${messageMerge.gaps.length}개의 sequence 누락 구간이 있습니다.`,
    );
  }

  if (nextHistory !== currentHistory) {
    queryClient.setQueryData(messageHistoryKey, nextHistory);
  }

  if (roomEventJournalMerge.journal !== currentRoomEventJournal) {
    queryClient.setQueryData(roomEventJournalKey, roomEventJournalMerge.journal);
  }

  applyChatRoomEventCacheProjection(queryClient, roomEventProjection);

  return {
    deliveryId: delivery.deliveryId,
    messageCount: messageEvents.length,
    roomEventCount: roomEvents.length,
    messageMerge,
  };
}

function requireMessageHistory(
  queryClient: QueryClient,
  roomId: string,
  limit: number,
): ChatMessageHistoryData {
  const queryKey = chatRoomQueryKeys.messageHistory(roomId, limit);
  const history = queryClient.getQueryData<ChatMessageHistoryData>(queryKey);

  if (!history || history.pages.length === 0) {
    throw new ChatRealtimeQueryCoordinatorError(
      "MESSAGE_HISTORY_NOT_READY",
      `채팅방 ${roomId}의 REST 메시지 snapshot이 아직 cache에 없습니다.`,
    );
  }

  return history;
}

function mergeRoomEventJournal(
  roomId: string,
  journal: ChatRoomEventJournal | undefined,
  incomingEvents: readonly ChatRoomEventEnvelope[],
): Readonly<{
  addedEvents: readonly ChatRoomEventEnvelope[];
  journal: ChatRoomEventJournal | undefined;
}> {
  if (journal && journal.roomId !== roomId) {
    throw new ChatRealtimeQueryCoordinatorError(
      "ROOM_EVENT_JOURNAL_MISMATCH",
      `다른 방(${journal.roomId})의 Room Event journal을 ${roomId}에 사용할 수 없습니다.`,
    );
  }

  if (incomingEvents.length === 0) {
    return {
      addedEvents: [],
      journal,
    };
  }

  const events = [...(journal?.events ?? [])];
  const eventsById = new Map(events.map((event) => [event.eventId, event] as const));
  const addedEvents: ChatRoomEventEnvelope[] = [];

  for (const event of incomingEvents) {
    if (event.payload.roomId !== roomId) {
      throw new ChatRealtimeQueryCoordinatorError(
        "ROOM_EVENT_JOURNAL_MISMATCH",
        `다른 방(${event.payload.roomId})의 Room Event를 ${roomId} journal에 넣을 수 없습니다.`,
      );
    }

    const existing = eventsById.get(event.eventId);

    if (existing) {
      if (!isSameRoomEvent(existing, event)) {
        throw new ChatRealtimeQueryCoordinatorError(
          "ROOM_EVENT_CONFLICT",
          `Room Event ${event.eventId}의 payload가 기존 journal과 다릅니다.`,
        );
      }
      continue;
    }

    eventsById.set(event.eventId, event);
    events.push(event);
    addedEvents.push(event);
  }

  return {
    addedEvents,
    journal: {
      roomId,
      events,
    },
  };
}

function isSameRoomEvent(left: ChatRoomEventEnvelope, right: ChatRoomEventEnvelope): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function getDeliveryRecoveryTarget(
  queryClient: QueryClient,
  delivery: ChatRealtimeEventDelivery,
  limit: number,
): number {
  const history = requireMessageHistory(queryClient, delivery.roomId, limit);
  const merge = mergeChatMessages({
    roomId: delivery.roomId,
    sources: [
      ...history.pages.map((page) => page.items),
      delivery.events
        .filter((event) => event.kind === "message")
        .map((event) => event.event.payload),
    ],
  });

  return merge.messages.at(-1)?.roomSequence ?? 0;
}
