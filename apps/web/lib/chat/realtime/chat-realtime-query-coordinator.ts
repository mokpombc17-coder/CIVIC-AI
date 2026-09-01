import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { chatRoomApi, type ChatRoomApi } from "../chat-room-api";
import type {
  RoomDetails,
  RoomMembership,
  RoomMembershipListResponse,
} from "../chat-room-contracts";
import { getRoomParticipantDisplayName } from "../chat-room-participant-profiles";
import { DEFAULT_MESSAGE_HISTORY_LIMIT, chatRoomQueryKeys } from "../chat-room-queries";
import {
  inspectSortedChatMessages,
  mergeChatMessages,
  type ChatMessageMergeResult,
} from "../chat-message-merge";
import {
  getLastContiguousMessageSequence,
  mergeMessagesIntoChatHistory,
  recoverChatMessageHistory,
  type ChatMessageHistoryData,
  type ChatMessageRecoveryResult,
} from "./chat-message-recovery";
import {
  refreshLoadedChatMessageSnapshots,
  type ChatMessageSnapshotRefreshResult,
} from "./chat-message-snapshot-refresh";
import type { ChatRealtimeEventDelivery } from "./chat-realtime-event-buffer";
import {
  ChatRoomReadReceiptCoordinator,
  type ChatRoomReadReceiptCoordinatorOptions,
} from "./chat-room-read-receipt-coordinator";
import { applyChatRoomMessageSearchCacheEffects } from "./chat-room-message-search-cache-effects";
import {
  createChatRoomEventKey,
  mergeChatRoomSystemActivities,
  type ChatRoomSystemActivityJournal,
} from "./chat-room-system-activity";
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
  readReceiptEventCount: number;
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
  messageVisibleAfterSequence: number;
  onApplied?: (result: ApplyChatRealtimeDeliveryResult) => void;
  onError?: (error: unknown) => void;
  onRecoveryStarted?: (throughSequence: number) => void;
  onRecovered?: (result: ChatMessageRecoveryResult) => void;
  onSnapshotRefreshStarted?: () => void;
  onSnapshotRefreshed?: (result: ChatMessageSnapshotRefreshResult) => void;
  onSynchronized?: () => void;
  readReceipt?: Omit<ChatRoomReadReceiptCoordinatorOptions, "generation" | "roomId">;
  refreshLoadedPagesBeforeSnapshot?: boolean;
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
  private loadedPagesRefreshed: boolean;
  private readonly readReceiptCoordinator: ChatRoomReadReceiptCoordinator | null;
  private recovery: Promise<ChatMessageRecoveryResult> | null = null;
  private roomSnapshotApplied = false;
  private snapshotRefresh: Promise<ChatMessageSnapshotRefreshResult> | null = null;
  private stopped = true;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly queryClient: QueryClient,
    private readonly transport: ChatRealtimeQueryCoordinatorTransport,
    private readonly options: ChatRealtimeQueryCoordinatorOptions,
  ) {
    this.loadedPagesRefreshed = !options.refreshLoadedPagesBeforeSnapshot;
    this.readReceiptCoordinator = options.readReceipt
      ? new ChatRoomReadReceiptCoordinator(queryClient, {
          ...options.readReceipt,
          generation: options.generation,
          roomId: options.roomId,
        })
      : null;
  }

  start(): void {
    if (this.unsubscribe) {
      return;
    }

    this.stopped = false;
    this.readReceiptCoordinator?.start();
    this.unsubscribe = this.transport.observeRealtimeEventDelivery(
      this.handleRealtimeEventDelivery,
    );
    this.handleRealtimeEventDelivery();
  }

  stop(): void {
    this.stopped = true;
    this.roomSnapshotApplied = false;
    this.readReceiptCoordinator?.stop();
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  notifyRoomSnapshotApplied(): void {
    if (this.roomSnapshotApplied || this.recovery || this.snapshotRefresh) {
      return;
    }

    const { generation, roomId } = this.options;
    const history = requireMessageHistory(
      this.queryClient,
      roomId,
      this.options.limit ?? DEFAULT_MESSAGE_HISTORY_LIMIT,
    );

    if (!this.loadedPagesRefreshed) {
      this.startSnapshotRefresh();
      return;
    }

    const watermarkSequence = this.options.watermarkSequence ?? 0;
    const lastContiguousSequence = getLastContiguousMessageSequence(
      roomId,
      history,
      this.options.messageVisibleAfterSequence,
    );

    if (lastContiguousSequence >= watermarkSequence) {
      this.completeRoomSnapshot(roomId, generation);
      return;
    }

    this.startRecovery(watermarkSequence, () => {
      this.completeRoomSnapshot(roomId, generation);
    });
  }

  retryPendingDelivery(): void {
    this.readReceiptCoordinator?.retry();

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
      const coreResult = applyChatRealtimeEventDelivery(
        this.queryClient,
        delivery,
        this.options.limit ?? DEFAULT_MESSAGE_HISTORY_LIMIT,
        this.options.messageVisibleAfterSequence,
        this.options.onError,
      );
      const result = {
        ...coreResult,
        readReceiptEventCount: this.readReceiptCoordinator?.handleDelivery(delivery) ?? 0,
      };
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
          this.options.messageVisibleAfterSequence,
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
    this.options.onSynchronized?.();
  }

  private startRecovery(throughSequence: number, onRecovered: () => void): void {
    if (this.recovery || this.stopped) {
      return;
    }

    const operation = recoverChatMessageHistory(this.queryClient, {
      api: this.options.api ?? chatRoomApi,
      limit: this.options.limit ?? DEFAULT_MESSAGE_HISTORY_LIMIT,
      messageVisibleAfterSequence: this.options.messageVisibleAfterSequence,
      roomId: this.options.roomId,
      throughSequence,
    });
    this.recovery = operation;
    this.options.onRecoveryStarted?.(throughSequence);

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

  private startSnapshotRefresh(): void {
    if (this.snapshotRefresh || this.stopped) {
      return;
    }

    const operation = refreshLoadedChatMessageSnapshots(this.queryClient, {
      api: this.options.api ?? chatRoomApi,
      limit: this.options.limit ?? DEFAULT_MESSAGE_HISTORY_LIMIT,
      roomId: this.options.roomId,
    });
    this.snapshotRefresh = operation;
    this.options.onSnapshotRefreshStarted?.();

    void operation.then(
      (result) => {
        if (this.snapshotRefresh !== operation) {
          return;
        }

        this.snapshotRefresh = null;
        this.loadedPagesRefreshed = true;

        if (this.stopped) {
          return;
        }

        this.options.onSnapshotRefreshed?.(result);
        this.notifyRoomSnapshotApplied();
      },
      (error: unknown) => {
        if (this.snapshotRefresh === operation) {
          this.snapshotRefresh = null;
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
  messageVisibleAfterSequence = 0,
  onAuthoritativeRefreshError?: (error: unknown) => void,
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
  const hadVisibleMessage = currentHistory.pages.some((page) =>
    page.items.some((message) => message.roomSequence > messageVisibleAfterSequence),
  );
  const messageEvents = delivery.events
    .filter((event) => event.kind === "message")
    .filter((event) => event.event.payload.roomSequence > messageVisibleAfterSequence);
  const applicableMessageSnapshots = selectApplicableMessageSnapshots(
    currentHistory,
    messageEvents,
  );
  const roomEvents = delivery.events.filter((event) => event.kind === "room");
  const initialLatestMessageSequence = currentHistory.pages.reduce(
    (latest, page) =>
      page.items.reduce(
        (pageLatest, message) =>
          message.roomSequence > messageVisibleAfterSequence
            ? Math.max(pageLatest, message.roomSequence)
            : pageLatest,
        latest,
      ),
    messageVisibleAfterSequence,
  );
  const systemActivityJournalKey = chatRoomQueryKeys.systemActivityJournal(delivery.roomId);
  const currentSystemActivityJournal =
    queryClient.getQueryData<ChatRoomSystemActivityJournal>(systemActivityJournalKey);
  const nextSystemActivityJournal = mergeChatRoomSystemActivities({
    delivery,
    initialLatestMessageSequence,
    journal: currentSystemActivityJournal,
    messageVisibleAfterSequence,
    participantDisplayNames: getCachedRoomParticipantDisplayNames(queryClient, delivery.roomId),
    selfMembershipId: getCurrentRoomMembershipId(queryClient, delivery.roomId),
  });
  const { history: nextHistory, merge: historyMerge } = mergeMessagesIntoChatHistory(
    delivery.roomId,
    currentHistory,
    applicableMessageSnapshots,
  );
  const messageMerge = inspectSortedChatMessages(
    historyMerge.messages.filter((message) => message.roomSequence > messageVisibleAfterSequence),
    hadVisibleMessage ? undefined : messageVisibleAfterSequence,
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

  if (nextSystemActivityJournal !== currentSystemActivityJournal) {
    queryClient.setQueryData(systemActivityJournalKey, nextSystemActivityJournal);
  }

  applyChatRoomEventCacheProjection(queryClient, roomEventProjection, onAuthoritativeRefreshError);

  try {
    applyChatRoomMessageSearchCacheEffects(
      queryClient,
      delivery.roomId,
      delivery.generation,
      messageEvents,
    );
  } catch {
    queryClient.removeQueries({
      queryKey: chatRoomQueryKeys.messageSearchesForRoom(delivery.roomId),
    });
    queryClient.removeQueries({
      queryKey: chatRoomQueryKeys.messageContextsForRoom(delivery.roomId),
    });
  }

  return {
    deliveryId: delivery.deliveryId,
    messageCount: messageEvents.length,
    readReceiptEventCount: 0,
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
  const eventsById = new Map(
    events.map((event) => [createChatRoomEventKey(event), event] as const),
  );
  const addedEvents: ChatRoomEventEnvelope[] = [];

  for (const event of incomingEvents) {
    if (event.payload.roomId !== roomId) {
      throw new ChatRealtimeQueryCoordinatorError(
        "ROOM_EVENT_JOURNAL_MISMATCH",
        `다른 방(${event.payload.roomId})의 Room Event를 ${roomId} journal에 넣을 수 없습니다.`,
      );
    }

    const eventKey = createChatRoomEventKey(event);
    const existing = eventsById.get(eventKey);

    if (existing) {
      if (!isSameRoomEvent(existing, event)) {
        throw new ChatRealtimeQueryCoordinatorError(
          "ROOM_EVENT_CONFLICT",
          `Room Event ${eventKey}의 payload가 기존 journal과 다릅니다.`,
        );
      }
      continue;
    }

    eventsById.set(eventKey, event);
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

function getCurrentRoomMembershipId(queryClient: QueryClient, roomId: string): string | null {
  const membership = queryClient.getQueryData<RoomMembership>(
    chatRoomQueryKeys.myMembership(roomId),
  );
  const room = queryClient.getQueryData<RoomDetails>(chatRoomQueryKeys.detail(roomId));
  return membership?.membershipId ?? room?.myMembership?.membershipId ?? null;
}

function getCachedRoomParticipantDisplayNames(
  queryClient: QueryClient,
  roomId: string,
): ReadonlyMap<string, string> {
  const displayNames = new Map<string, string>();

  for (const [, data] of queryClient.getQueriesData<
    InfiniteData<RoomMembershipListResponse, string | null>
  >({ queryKey: chatRoomQueryKeys.membershipLists(roomId) })) {
    for (const membership of data?.pages.flatMap((page) => page.items) ?? []) {
      displayNames.set(membership.membershipId, getRoomParticipantDisplayName(membership));
    }
  }

  return displayNames;
}

function getDeliveryRecoveryTarget(
  queryClient: QueryClient,
  delivery: ChatRealtimeEventDelivery,
  limit: number,
  messageVisibleAfterSequence: number,
): number {
  const history = requireMessageHistory(queryClient, delivery.roomId, limit);
  const messageEvents = delivery.events
    .filter((event) => event.kind === "message")
    .filter((event) => event.event.payload.roomSequence > messageVisibleAfterSequence);
  const merge = mergeChatMessages({
    roomId: delivery.roomId,
    sources: [
      ...history.pages.map((page) =>
        page.items.filter((message) => message.roomSequence > messageVisibleAfterSequence),
      ),
      selectApplicableMessageSnapshots(history, messageEvents),
    ],
  });

  return merge.messages.at(-1)?.roomSequence ?? messageVisibleAfterSequence;
}

function selectApplicableMessageSnapshots(
  history: ChatMessageHistoryData,
  events: readonly Extract<ChatRealtimeEventDelivery["events"][number], { kind: "message" }>[],
) {
  const loadedMessageIds = new Set(
    history.pages.flatMap((page) => page.items.map((message) => message.messageId)),
  );
  const createdMessageIds = new Set(
    events
      .filter((event) => event.event.eventType === "CHAT_MESSAGE_CREATED")
      .map((event) => event.event.payload.messageId),
  );

  return events
    .filter(
      (event) =>
        event.event.eventType === "CHAT_MESSAGE_CREATED" ||
        loadedMessageIds.has(event.event.payload.messageId) ||
        createdMessageIds.has(event.event.payload.messageId),
    )
    .map((event) => event.event.payload);
}
