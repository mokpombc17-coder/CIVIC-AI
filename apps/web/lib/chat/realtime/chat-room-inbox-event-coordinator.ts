import type { ChatRoomInboxEvent } from "./chat-stomp-contracts";

export const ROOM_INBOX_INVALIDATION_DEBOUNCE_MS = 400;
export const ROOM_INBOX_INVALIDATION_MAX_WAIT_MS = 1_500;
export const ROOM_INBOX_SOURCE_EVENT_TTL_MS = 5 * 60_000;
export const ROOM_INBOX_SOURCE_EVENT_MAX_ENTRIES = 1_000;

type TimerHandle = ReturnType<typeof setTimeout>;

type ChatRoomInboxEventCoordinatorOptions = Readonly<{
  clearTimer?: (timer: TimerHandle) => void;
  now?: () => number;
  onCreate: (
    event: Extract<ChatRoomInboxEvent, { cause: "MESSAGE_CREATED" }>,
    count: number,
  ) => void;
  onInvalidate: () => void;
  setTimer?: (callback: () => void, delayMs: number) => TimerHandle;
}>;

export class ChatRoomInboxEventCoordinator {
  private debounceTimer: TimerHandle | null = null;
  private maxWaitTimer: TimerHandle | null = null;
  private readonly seenSourceEventIds = new Map<string, number>();

  constructor(private readonly options: ChatRoomInboxEventCoordinatorOptions) {}

  handle(event: ChatRoomInboxEvent): void {
    const unseenCount = this.rememberUnseenSourceEventIds(event.sourceEventIds);

    if (unseenCount === 0) {
      return;
    }

    this.requestInvalidation();

    if (event.cause === "MESSAGE_CREATED") {
      this.options.onCreate(event, unseenCount);
    }
  }

  requestInvalidation(): void {
    const setTimer = this.options.setTimer ?? setTimeout;
    const clearTimer = this.options.clearTimer ?? clearTimeout;

    if (this.debounceTimer) {
      clearTimer(this.debounceTimer);
    }

    this.debounceTimer = setTimer(
      () => this.flushInvalidation(),
      ROOM_INBOX_INVALIDATION_DEBOUNCE_MS,
    );
    this.maxWaitTimer ??= setTimer(
      () => this.flushInvalidation(),
      ROOM_INBOX_INVALIDATION_MAX_WAIT_MS,
    );
  }

  dispose(): void {
    this.clearInvalidationTimers();
    this.seenSourceEventIds.clear();
  }

  private flushInvalidation(): void {
    this.clearInvalidationTimers();
    this.options.onInvalidate();
  }

  private clearInvalidationTimers(): void {
    const clearTimer = this.options.clearTimer ?? clearTimeout;

    if (this.debounceTimer) {
      clearTimer(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.maxWaitTimer) {
      clearTimer(this.maxWaitTimer);
      this.maxWaitTimer = null;
    }
  }

  private rememberUnseenSourceEventIds(sourceEventIds: readonly string[]): number {
    const now = (this.options.now ?? Date.now)();
    this.pruneExpiredSourceEventIds(now);
    let unseenCount = 0;

    for (const sourceEventId of sourceEventIds) {
      if (this.seenSourceEventIds.has(sourceEventId)) {
        continue;
      }

      this.seenSourceEventIds.set(sourceEventId, now);
      unseenCount += 1;
    }

    while (this.seenSourceEventIds.size > ROOM_INBOX_SOURCE_EVENT_MAX_ENTRIES) {
      const oldestSourceEventId = this.seenSourceEventIds.keys().next().value;

      if (oldestSourceEventId === undefined) {
        break;
      }

      this.seenSourceEventIds.delete(oldestSourceEventId);
    }

    return unseenCount;
  }

  private pruneExpiredSourceEventIds(now: number): void {
    for (const [sourceEventId, seenAt] of this.seenSourceEventIds) {
      if (now - seenAt < ROOM_INBOX_SOURCE_EVENT_TTL_MS) {
        break;
      }

      this.seenSourceEventIds.delete(sourceEventId);
    }
  }
}
