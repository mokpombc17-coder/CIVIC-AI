import type { QueryClient } from "@tanstack/react-query";
import { chatRoomApi, type ChatRoomApi } from "../chat-room-api";
import type { RoomReadReceiptPosition } from "../chat-room-contracts";
import { chatRoomQueryKeys, roomReadReceiptStateQueryOptions } from "../chat-room-queries";
import type { ChatRoomReadReceiptState } from "../chat-room-read-receipt-state";
import type { ChatRealtimeEventDelivery } from "./chat-realtime-event-buffer";
import type { ChatRoomReadReceiptEventEnvelope } from "./chat-stomp-contracts";

export const CHAT_ROOM_READ_RECEIPT_MAX_RECOVERY_ATTEMPTS = 3;

export type ChatRoomReadReceiptSyncStatus =
  "idle" | "loading" | "ready" | "refreshing" | "error" | "terminal";

export type ChatRoomReadReceiptSyncSnapshot = Readonly<{
  error: unknown | null;
  generation: number;
  roomId: string;
  status: ChatRoomReadReceiptSyncStatus;
}>;

export type ChatRoomReadReceiptCoordinatorOptions = Readonly<{
  api?: Pick<ChatRoomApi, "getRoomReadReceiptState">;
  generation: number;
  maxRecoveryAttempts?: number;
  onError?: (error: unknown) => void;
  onStateChange?: (snapshot: ChatRoomReadReceiptSyncSnapshot) => void;
  roomId: string;
}>;

type ReadPositionAdvance = Extract<
  ChatRoomReadReceiptEventEnvelope,
  { eventType: "ROOM_READ_POSITIONS_ADVANCED" }
>["payload"]["updates"][number];

type SnapshotOperation = Readonly<{
  promise: Promise<ChatRoomReadReceiptState>;
  revision: number;
}>;

export class ChatRoomReadReceiptCoordinatorError extends Error {
  override readonly name = "ChatRoomReadReceiptCoordinatorError";

  constructor(
    readonly code: "ROOM_MISMATCH" | "RECOVERY_LIMIT_EXCEEDED",
    message: string,
  ) {
    super(message);
  }
}

export class ChatRoomReadReceiptCoordinator {
  private error: unknown | null = null;
  private inFlight: SnapshotOperation | null = null;
  private readonly maxRecoveryAttempts: number;
  private readonly pendingAdvances = new Map<string, ReadPositionAdvance>();
  private recoveryAttempts = 0;
  private snapshotRevision = 0;
  private status: ChatRoomReadReceiptSyncStatus = "idle";
  private stopped = true;

  constructor(
    private readonly queryClient: QueryClient,
    private readonly options: ChatRoomReadReceiptCoordinatorOptions,
  ) {
    this.maxRecoveryAttempts =
      options.maxRecoveryAttempts ?? CHAT_ROOM_READ_RECEIPT_MAX_RECOVERY_ATTEMPTS;

    if (!Number.isSafeInteger(this.maxRecoveryAttempts) || this.maxRecoveryAttempts < 1) {
      throw new RangeError("Read Receipt 복구 횟수는 1 이상의 안전한 정수여야 합니다.");
    }
  }

  start(): void {
    if (!this.stopped) {
      return;
    }

    this.stopped = false;
    const cachedState = this.queryClient.getQueryData<ChatRoomReadReceiptState>(
      chatRoomQueryKeys.readReceiptState(this.options.roomId, this.options.generation),
    );

    if (cachedState?.roomId === this.options.roomId) {
      this.error = null;
      this.setStatus("ready");
      return;
    }

    this.setStatus("loading");
    this.startSnapshotFetch();
  }

  stop(): void {
    if (this.stopped) {
      return;
    }

    this.stopped = true;
    this.snapshotRevision += 1;
    this.inFlight = null;
    this.pendingAdvances.clear();
    this.recoveryAttempts = 0;
    this.error = null;
    this.status = "idle";

    const queryKey = chatRoomQueryKeys.readReceiptState(
      this.options.roomId,
      this.options.generation,
    );
    void this.queryClient.cancelQueries({ queryKey, exact: true });
    this.queryClient.removeQueries({ queryKey, exact: true });
  }

  retry(): void {
    if (this.stopped || this.status === "terminal" || this.inFlight) {
      return;
    }

    this.recoveryAttempts = 0;
    this.requestSnapshotRefresh(false);
  }

  getSnapshot(): ChatRoomReadReceiptSyncSnapshot {
    return {
      error: this.error,
      generation: this.options.generation,
      roomId: this.options.roomId,
      status: this.status,
    };
  }

  handleDelivery(delivery: ChatRealtimeEventDelivery): number {
    if (
      this.stopped ||
      this.status === "terminal" ||
      delivery.roomId !== this.options.roomId ||
      delivery.generation !== this.options.generation
    ) {
      return 0;
    }

    let readReceiptEventCount = 0;

    try {
      if (delivery.invalidReadReceiptEventCount > 0) {
        this.requestSnapshotRefresh(true);
      }

      for (const bufferedEvent of delivery.events) {
        if (bufferedEvent.kind === "read-receipt") {
          readReceiptEventCount += 1;
          this.handleReadReceiptEvent(bufferedEvent.event);
          continue;
        }

        if (bufferedEvent.kind === "room") {
          this.handleRoomTopologyEvent(bufferedEvent.event.eventType);
        }
      }
    } catch (error) {
      this.fail(error);
    }

    return readReceiptEventCount;
  }

  private handleReadReceiptEvent(event: ChatRoomReadReceiptEventEnvelope): void {
    if (event.eventType === "ROOM_READ_RECEIPT_STATE_INVALIDATED") {
      this.requestSnapshotRefresh(true);
      return;
    }

    for (const update of event.payload.updates) {
      this.handleAdvance(update);
    }
  }

  private handleAdvance(update: ReadPositionAdvance): void {
    if (this.status !== "ready") {
      this.rememberAdvance(update);

      if (this.status === "error") {
        this.requestSnapshotRefresh(false);
      }
      return;
    }

    const queryKey = chatRoomQueryKeys.readReceiptState(
      this.options.roomId,
      this.options.generation,
    );
    const state = this.queryClient.getQueryData<ChatRoomReadReceiptState>(queryKey);
    const current = state?.positionsByMembershipId[update.membershipId];

    if (!state || !current || update.membershipVersion > current.membershipVersion) {
      this.rememberAdvance(update);
      this.requestSnapshotRefresh(false);
      return;
    }

    if (
      update.membershipVersion < current.membershipVersion ||
      update.storedLastReadSequence <= current.storedLastReadSequence
    ) {
      return;
    }

    this.queryClient.setQueryData<ChatRoomReadReceiptState>(queryKey, {
      ...state,
      positionsByMembershipId: {
        ...state.positionsByMembershipId,
        [update.membershipId]: {
          ...current,
          storedLastReadSequence: update.storedLastReadSequence,
        },
      },
    });
  }

  private handleRoomTopologyEvent(eventType: string): void {
    if (eventType === "ROOM_CLOSED") {
      this.terminate();
      return;
    }

    if (
      eventType === "ROOM_MEMBER_JOINED" ||
      eventType === "ROOM_MEMBER_REJOINED" ||
      eventType === "ROOM_MEMBER_LEFT" ||
      eventType === "ROOM_MEMBER_BANNED" ||
      eventType === "ROOM_OWNERSHIP_TRANSFERRED"
    ) {
      this.requestSnapshotRefresh(true);
    }
  }

  private requestSnapshotRefresh(clearPending: boolean): void {
    if (this.stopped || this.status === "terminal") {
      return;
    }

    if (clearPending) {
      this.pendingAdvances.clear();
    }

    this.snapshotRevision += 1;
    this.setStatus("refreshing");

    if (!this.inFlight) {
      this.startSnapshotFetch();
    }
  }

  private startSnapshotFetch(): void {
    if (this.stopped || this.status === "terminal" || this.inFlight) {
      return;
    }

    const { generation, roomId } = this.options;
    const revision = this.snapshotRevision;
    const queryOptions = roomReadReceiptStateQueryOptions(
      roomId,
      { enabled: true, generation },
      this.options.api ?? chatRoomApi,
    );
    const promise = this.queryClient.fetchQuery({
      ...queryOptions,
      staleTime: 0,
    });
    const operation = { promise, revision };
    this.inFlight = operation;

    void promise.then(
      (state) => this.completeSnapshotFetch(operation, state),
      (error: unknown) => this.failSnapshotFetch(operation, error),
    );
  }

  private completeSnapshotFetch(
    operation: SnapshotOperation,
    state: ChatRoomReadReceiptState,
  ): void {
    if (this.inFlight !== operation) {
      return;
    }

    this.inFlight = null;

    if (this.stopped || this.status === "terminal") {
      return;
    }

    if (operation.revision !== this.snapshotRevision) {
      this.startSnapshotFetch();
      return;
    }

    if (state.roomId !== this.options.roomId) {
      this.fail(
        new ChatRoomReadReceiptCoordinatorError(
          "ROOM_MISMATCH",
          `다른 방(${state.roomId})의 Read Receipt snapshot을 ${this.options.roomId}에 적용할 수 없습니다.`,
        ),
      );
      return;
    }

    const { mergedState, unresolved } = mergePendingAdvances(state, this.pendingAdvances.values());
    const queryKey = chatRoomQueryKeys.readReceiptState(
      this.options.roomId,
      this.options.generation,
    );
    this.queryClient.setQueryData(queryKey, mergedState);
    this.pendingAdvances.clear();

    for (const update of unresolved) {
      this.rememberAdvance(update);
    }

    if (this.pendingAdvances.size > 0) {
      if (this.recoveryAttempts >= this.maxRecoveryAttempts) {
        this.fail(
          new ChatRoomReadReceiptCoordinatorError(
            "RECOVERY_LIMIT_EXCEEDED",
            `채팅방 ${this.options.roomId}의 Read Receipt snapshot이 실시간 cursor를 ${this.maxRecoveryAttempts}회 안에 따라잡지 못했습니다.`,
          ),
        );
        return;
      }

      this.recoveryAttempts += 1;
      this.snapshotRevision += 1;
      this.setStatus("refreshing");
      this.startSnapshotFetch();
      return;
    }

    this.recoveryAttempts = 0;
    this.error = null;
    this.setStatus("ready");
  }

  private failSnapshotFetch(operation: SnapshotOperation, error: unknown): void {
    if (this.inFlight !== operation) {
      return;
    }

    this.inFlight = null;

    if (!this.stopped && this.status !== "terminal") {
      this.fail(error);
    }
  }

  private rememberAdvance(update: ReadPositionAdvance): void {
    const current = this.pendingAdvances.get(update.membershipId);

    if (!current || update.membershipVersion > current.membershipVersion) {
      this.pendingAdvances.set(update.membershipId, update);
      return;
    }

    if (
      update.membershipVersion === current.membershipVersion &&
      update.storedLastReadSequence > current.storedLastReadSequence
    ) {
      this.pendingAdvances.set(update.membershipId, update);
    }
  }

  private terminate(): void {
    this.snapshotRevision += 1;
    this.inFlight = null;
    this.pendingAdvances.clear();
    this.error = null;
    this.setStatus("terminal");

    const queryKey = chatRoomQueryKeys.readReceiptState(
      this.options.roomId,
      this.options.generation,
    );
    void this.queryClient.cancelQueries({ queryKey, exact: true });
    this.queryClient.removeQueries({ queryKey, exact: true });
  }

  private fail(error: unknown): void {
    this.error = error;
    this.setStatus("error");
    this.options.onError?.(error);
  }

  private setStatus(status: ChatRoomReadReceiptSyncStatus): void {
    const changed = this.status !== status;
    this.status = status;

    if (changed) {
      this.options.onStateChange?.(this.getSnapshot());
    }
  }
}

function mergePendingAdvances(
  state: ChatRoomReadReceiptState,
  pending: Iterable<ReadPositionAdvance>,
): Readonly<{
  mergedState: ChatRoomReadReceiptState;
  unresolved: readonly ReadPositionAdvance[];
}> {
  let positionsByMembershipId = state.positionsByMembershipId;
  const unresolved: ReadPositionAdvance[] = [];

  for (const update of pending) {
    const current = positionsByMembershipId[update.membershipId];

    if (!current || update.membershipVersion > current.membershipVersion) {
      unresolved.push(update);
      continue;
    }

    if (
      update.membershipVersion < current.membershipVersion ||
      update.storedLastReadSequence <= current.storedLastReadSequence
    ) {
      continue;
    }

    positionsByMembershipId = {
      ...positionsByMembershipId,
      [update.membershipId]: mergePosition(current, update),
    };
  }

  return {
    mergedState:
      positionsByMembershipId === state.positionsByMembershipId
        ? state
        : { ...state, positionsByMembershipId },
    unresolved,
  };
}

function mergePosition(
  position: RoomReadReceiptPosition,
  update: ReadPositionAdvance,
): RoomReadReceiptPosition {
  return {
    ...position,
    storedLastReadSequence: Math.max(
      position.storedLastReadSequence,
      update.storedLastReadSequence,
    ),
  };
}
