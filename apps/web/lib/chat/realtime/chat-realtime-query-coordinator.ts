import { type InfiniteData, type QueryClient } from "@tanstack/react-query";
import { DEFAULT_MESSAGE_HISTORY_LIMIT, chatRoomQueryKeys } from "../chat-room-queries";
import type { ChatMessage, MessageHistoryResponse } from "../chat-room-contracts";
import { mergeChatMessages, type ChatMessageMergeResult } from "../chat-message-merge";
import type { ChatRealtimeEventDelivery } from "./chat-realtime-event-buffer";
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
  roomId: string;
  generation: number;
  limit?: number;
  onApplied?: (result: ApplyChatRealtimeDeliveryResult) => void;
  onError?: (error: unknown) => void;
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

    this.unsubscribe = this.transport.observeRealtimeEventDelivery(
      this.handleRealtimeEventDelivery,
    );
    this.handleRealtimeEventDelivery();
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  notifyRoomSnapshotApplied(): void {
    const { generation, roomId } = this.options;

    requireMessageHistory(
      this.queryClient,
      roomId,
      this.options.limit ?? DEFAULT_MESSAGE_HISTORY_LIMIT,
    );
    this.transport.markRoomSnapshotApplied(roomId, generation);
  }

  retryPendingDelivery(): void {
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
      this.options.onError?.(error);
    }
  };
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
  const { history: nextHistory, merge: messageMerge } = mergeDeliveryMessages(
    delivery.roomId,
    currentHistory,
    messageEvents.map((event) => event.event.payload),
  );
  const roomEventJournalKey = chatRoomQueryKeys.roomEventJournal(delivery.roomId);
  const currentRoomEventJournal =
    queryClient.getQueryData<ChatRoomEventJournal>(roomEventJournalKey);
  const nextRoomEventJournal = mergeRoomEventJournal(
    delivery.roomId,
    currentRoomEventJournal,
    roomEvents.map((event) => event.event),
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

  if (nextRoomEventJournal !== currentRoomEventJournal) {
    queryClient.setQueryData(roomEventJournalKey, nextRoomEventJournal);
  }

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
): InfiniteData<MessageHistoryResponse, number | null> {
  const queryKey = chatRoomQueryKeys.messageHistory(roomId, limit);
  const history =
    queryClient.getQueryData<InfiniteData<MessageHistoryResponse, number | null>>(queryKey);

  if (!history || history.pages.length === 0) {
    throw new ChatRealtimeQueryCoordinatorError(
      "MESSAGE_HISTORY_NOT_READY",
      `채팅방 ${roomId}의 REST 메시지 snapshot이 아직 cache에 없습니다.`,
    );
  }

  return history;
}

function mergeDeliveryMessages(
  roomId: string,
  history: InfiniteData<MessageHistoryResponse, number | null>,
  incomingMessages: readonly ChatMessage[],
): Readonly<{
  history: InfiniteData<MessageHistoryResponse, number | null>;
  merge: ChatMessageMergeResult;
}> {
  const merge = mergeChatMessages({
    roomId,
    sources: [...history.pages.map((page) => page.items), incomingMessages],
  });

  if (incomingMessages.length === 0) {
    return { history, merge };
  }

  const latestPage = history.pages[0]!;
  const olderMessages = history.pages.slice(1).flatMap((page) => page.items);
  const olderMessageIds = new Set(olderMessages.map((message) => message.messageId));
  const olderRoomSequences = new Set(olderMessages.map((message) => message.roomSequence));
  const latestItems = merge.messages.filter(
    (message) =>
      !olderMessageIds.has(message.messageId) && !olderRoomSequences.has(message.roomSequence),
  );

  return {
    history: {
      ...history,
      pages: [
        {
          ...latestPage,
          items: latestItems,
        },
        ...history.pages.slice(1),
      ],
    },
    merge,
  };
}

function mergeRoomEventJournal(
  roomId: string,
  journal: ChatRoomEventJournal | undefined,
  incomingEvents: readonly ChatRoomEventEnvelope[],
): ChatRoomEventJournal | undefined {
  if (journal && journal.roomId !== roomId) {
    throw new ChatRealtimeQueryCoordinatorError(
      "ROOM_EVENT_JOURNAL_MISMATCH",
      `다른 방(${journal.roomId})의 Room Event journal을 ${roomId}에 사용할 수 없습니다.`,
    );
  }

  if (incomingEvents.length === 0) {
    return journal;
  }

  const events = [...(journal?.events ?? [])];
  const eventsById = new Map(events.map((event) => [event.eventId, event] as const));

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
  }

  return {
    roomId,
    events,
  };
}

function isSameRoomEvent(left: ChatRoomEventEnvelope, right: ChatRoomEventEnvelope): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
