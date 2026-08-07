import { roomIdSchema } from "./chat-room-contracts";
import {
  ROOM_READ_STATE_DEBOUNCE_MS,
  ROOM_READ_STATE_MAX_WAIT_MS,
} from "./chat-room-read-state-scheduler";

export type ChatRoomReadStateStatus = "idle" | "pending" | "submitting" | "blocked" | "terminal";

export type ChatRoomReadStateFailureDisposition = "retryable" | "blocked" | "terminal";

export type ChatRoomReadStateCancellationReason =
  "ROOM_CLOSED" | "LEFT" | "BANNED" | "NOT_JOINED" | "ACCESS_REVOKED";

export type ChatRoomReadStateEntrySnapshot = Readonly<{
  confirmedSequence: number;
  inFlightSequence: number | null;
  lastError: unknown | null;
  pendingSequence: number | null;
  retryAttempt: number;
  status: ChatRoomReadStateStatus;
}>;

export type ChatRoomReadStateConfirmedEvent = Readonly<{
  readThroughSequence: number;
  roomId: string;
  submittedSequence: number;
}>;

type TimerHandle = ReturnType<typeof globalThis.setTimeout>;

type MutableRoomReadStateEntry = {
  confirmedSequence: number;
  debounceTimer: TimerHandle | null;
  generation: number;
  inFlightSequence: number | null;
  lastError: unknown | null;
  maxWaitTimer: TimerHandle | null;
  pendingSequence: number | null;
  retryAttempt: number;
  status: ChatRoomReadStateStatus;
};

type ChatRoomReadStateCoordinatorOptions = Readonly<{
  cancelTimer?: (handle: TimerHandle) => void;
  classifyFailure?: (error: unknown) => ChatRoomReadStateFailureDisposition;
  debounceMs?: number;
  maxWaitMs?: number;
  onConfirmed?: (event: ChatRoomReadStateConfirmedEvent) => void;
  onStateChange?: (roomId: string, snapshot: ChatRoomReadStateEntrySnapshot) => void;
  scheduleTimer?: (callback: () => void, delayMs: number) => TimerHandle;
  submit: (roomId: string, throughSequence: number) => Promise<number>;
}>;

export class ChatRoomReadStateContractError extends Error {
  readonly code = "READ_STATE_RESPONSE_BEHIND_SUBMISSION";

  constructor(
    readonly roomId: string,
    readonly submittedSequence: number,
    readonly readThroughSequence: number,
  ) {
    super(
      `Room ${roomId} read-state 응답 ${readThroughSequence}이 제출값 ${submittedSequence}보다 작습니다.`,
    );
    this.name = "ChatRoomReadStateContractError";
  }
}

export class ChatRoomReadStateTerminatedError extends Error {
  override readonly name = "ChatRoomReadStateTerminatedError";

  constructor(
    readonly roomId: string,
    readonly reason: ChatRoomReadStateCancellationReason,
  ) {
    super(`Room ${roomId} read-state 처리가 ${reason} 상태로 종료되었습니다.`);
  }
}

export class ChatRoomReadStateCoordinator {
  private readonly cancelTimer: (handle: TimerHandle) => void;
  private readonly classifyFailure: (error: unknown) => ChatRoomReadStateFailureDisposition;
  private readonly debounceMs: number;
  private readonly entries = new Map<string, MutableRoomReadStateEntry>();
  private readonly maxWaitMs: number;
  private readonly onConfirmed: (event: ChatRoomReadStateConfirmedEvent) => void;
  private readonly onStateChange: (
    roomId: string,
    snapshot: ChatRoomReadStateEntrySnapshot,
  ) => void;
  private readonly scheduleTimer: (callback: () => void, delayMs: number) => TimerHandle;
  private readonly submit: (roomId: string, throughSequence: number) => Promise<number>;
  private principalGeneration = 0;

  constructor({
    cancelTimer = (handle) => globalThis.clearTimeout(handle),
    classifyFailure = () => "retryable",
    debounceMs = ROOM_READ_STATE_DEBOUNCE_MS,
    maxWaitMs = ROOM_READ_STATE_MAX_WAIT_MS,
    onConfirmed = () => undefined,
    onStateChange = () => undefined,
    scheduleTimer = (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
    submit,
  }: ChatRoomReadStateCoordinatorOptions) {
    assertDelay(debounceMs, "debounceMs");
    assertDelay(maxWaitMs, "maxWaitMs");

    if (maxWaitMs < debounceMs) {
      throw new RangeError("maxWaitMs는 debounceMs 이상이어야 합니다.");
    }

    this.cancelTimer = cancelTimer;
    this.classifyFailure = classifyFailure;
    this.debounceMs = debounceMs;
    this.maxWaitMs = maxWaitMs;
    this.onConfirmed = onConfirmed;
    this.onStateChange = onStateChange;
    this.scheduleTimer = scheduleTimer;
    this.submit = submit;
  }

  schedule(roomIdInput: string, throughSequence: number): void {
    const roomId = roomIdSchema.parse(roomIdInput);
    assertSequence(throughSequence, "throughSequence");
    const entry = this.getOrCreateEntry(roomId);

    if (entry.status === "blocked" || entry.status === "terminal") {
      return;
    }

    const coveredSequence = Math.max(
      entry.confirmedSequence,
      entry.inFlightSequence ?? 0,
      entry.pendingSequence ?? 0,
    );

    if (throughSequence <= coveredSequence) {
      return;
    }

    entry.pendingSequence = throughSequence;
    entry.lastError = null;
    entry.status = "pending";
    this.emit(roomId, entry);

    if (entry.inFlightSequence !== null) {
      return;
    }

    this.scheduleFlush(roomId, entry);
  }

  flush(roomIdInput: string): void {
    const roomId = roomIdSchema.parse(roomIdInput);
    const entry = this.entries.get(roomId);

    if (!entry) {
      return;
    }

    this.clearTimers(entry);
    this.startSubmission(roomId, entry);
  }

  retryPending(roomIdInput?: string): void {
    if (roomIdInput !== undefined) {
      const roomId = roomIdSchema.parse(roomIdInput);
      const entry = this.entries.get(roomId);

      if (entry?.status === "pending") {
        this.clearTimers(entry);
        this.startSubmission(roomId, entry);
      }
      return;
    }

    for (const [roomId, entry] of this.entries) {
      if (entry.status !== "pending") {
        continue;
      }

      this.clearTimers(entry);
      this.startSubmission(roomId, entry);
    }
  }

  cancelRoom(roomIdInput: string, reason: ChatRoomReadStateCancellationReason): void {
    const roomId = roomIdSchema.parse(roomIdInput);
    const entry = this.entries.get(roomId);

    if (!entry) {
      return;
    }

    this.clearTimers(entry);
    entry.generation += 1;
    entry.inFlightSequence = null;
    entry.lastError = new ChatRoomReadStateTerminatedError(roomId, reason);
    entry.pendingSequence = null;
    entry.retryAttempt = 0;
    entry.status = "terminal";
    this.emit(roomId, entry);
  }

  resumeRoom(roomIdInput: string): void {
    const roomId = roomIdSchema.parse(roomIdInput);
    const entry = this.entries.get(roomId);

    if (!entry || (entry.status !== "blocked" && entry.status !== "terminal")) {
      return;
    }

    this.clearTimers(entry);
    entry.generation += 1;
    entry.inFlightSequence = null;
    entry.lastError = null;
    entry.retryAttempt = 0;
    entry.status = entry.pendingSequence === null ? "idle" : "pending";
    this.emit(roomId, entry);

    if (entry.pendingSequence !== null) {
      this.scheduleFlush(roomId, entry);
    }
  }

  resetForPrincipalChange(): void {
    this.principalGeneration += 1;

    for (const entry of this.entries.values()) {
      this.clearTimers(entry);
    }

    this.entries.clear();
  }

  getRoomSnapshot(roomIdInput: string): ChatRoomReadStateEntrySnapshot | null {
    const roomId = roomIdSchema.parse(roomIdInput);
    const entry = this.entries.get(roomId);
    return entry ? createSnapshot(entry) : null;
  }

  private getOrCreateEntry(roomId: string): MutableRoomReadStateEntry {
    const current = this.entries.get(roomId);

    if (current) {
      return current;
    }

    const entry: MutableRoomReadStateEntry = {
      confirmedSequence: 0,
      debounceTimer: null,
      generation: 0,
      inFlightSequence: null,
      lastError: null,
      maxWaitTimer: null,
      pendingSequence: null,
      retryAttempt: 0,
      status: "idle",
    };
    this.entries.set(roomId, entry);
    return entry;
  }

  private scheduleFlush(roomId: string, entry: MutableRoomReadStateEntry): void {
    if (entry.debounceTimer !== null) {
      this.cancelTimer(entry.debounceTimer);
    }

    entry.debounceTimer = this.scheduleTimer(() => this.flush(roomId), this.debounceMs);
    entry.maxWaitTimer ??= this.scheduleTimer(() => this.flush(roomId), this.maxWaitMs);
  }

  private startSubmission(roomId: string, entry: MutableRoomReadStateEntry): void {
    if (
      entry.inFlightSequence !== null ||
      entry.status === "blocked" ||
      entry.status === "terminal"
    ) {
      return;
    }

    const throughSequence = entry.pendingSequence;

    if (throughSequence === null || throughSequence <= entry.confirmedSequence) {
      entry.pendingSequence = null;
      entry.status = "idle";
      this.emit(roomId, entry);
      return;
    }

    entry.pendingSequence = null;
    entry.inFlightSequence = throughSequence;
    entry.status = "submitting";
    this.emit(roomId, entry);
    void this.submitEntry(
      roomId,
      entry,
      throughSequence,
      entry.generation,
      this.principalGeneration,
    );
  }

  private async submitEntry(
    roomId: string,
    entry: MutableRoomReadStateEntry,
    submittedSequence: number,
    entryGeneration: number,
    principalGeneration: number,
  ): Promise<void> {
    let readThroughSequence: number;

    try {
      readThroughSequence = await this.submit(roomId, submittedSequence);
      assertSequence(readThroughSequence, "readThroughSequence");

      if (readThroughSequence < submittedSequence) {
        throw new ChatRoomReadStateContractError(roomId, submittedSequence, readThroughSequence);
      }
    } catch (error) {
      if (!this.isCurrentRequest(roomId, entry, entryGeneration, principalGeneration)) {
        return;
      }

      entry.inFlightSequence = null;
      entry.lastError = error;
      const disposition =
        error instanceof ChatRoomReadStateContractError ? "blocked" : this.classifyFailure(error);

      if (disposition === "terminal") {
        entry.pendingSequence = null;
        entry.status = "terminal";
      } else {
        const nextPendingSequence = Math.max(entry.pendingSequence ?? 0, submittedSequence);
        entry.pendingSequence = nextPendingSequence;
        entry.status = disposition === "blocked" ? "blocked" : "pending";

        if (disposition === "retryable") {
          entry.retryAttempt += 1;
        }
      }

      this.emit(roomId, entry);

      if (
        disposition === "retryable" &&
        entry.pendingSequence !== null &&
        entry.pendingSequence > submittedSequence
      ) {
        this.startSubmission(roomId, entry);
      }
      return;
    }

    if (!this.isCurrentRequest(roomId, entry, entryGeneration, principalGeneration)) {
      return;
    }

    entry.confirmedSequence = Math.max(entry.confirmedSequence, readThroughSequence);
    entry.inFlightSequence = null;
    entry.lastError = null;
    entry.retryAttempt = 0;

    if (entry.pendingSequence !== null && entry.pendingSequence <= entry.confirmedSequence) {
      entry.pendingSequence = null;
    }

    entry.status = entry.pendingSequence === null ? "idle" : "pending";
    this.emit(roomId, entry);
    this.onConfirmed({
      readThroughSequence,
      roomId,
      submittedSequence,
    });

    if (entry.pendingSequence !== null) {
      this.startSubmission(roomId, entry);
    }
  }

  private isCurrentRequest(
    roomId: string,
    entry: MutableRoomReadStateEntry,
    entryGeneration: number,
    principalGeneration: number,
  ): boolean {
    return (
      this.principalGeneration === principalGeneration &&
      this.entries.get(roomId) === entry &&
      entry.generation === entryGeneration
    );
  }

  private clearTimers(entry: MutableRoomReadStateEntry): void {
    if (entry.debounceTimer !== null) {
      this.cancelTimer(entry.debounceTimer);
      entry.debounceTimer = null;
    }

    if (entry.maxWaitTimer !== null) {
      this.cancelTimer(entry.maxWaitTimer);
      entry.maxWaitTimer = null;
    }
  }

  private emit(roomId: string, entry: MutableRoomReadStateEntry): void {
    this.onStateChange(roomId, createSnapshot(entry));
  }
}

function createSnapshot(entry: MutableRoomReadStateEntry): ChatRoomReadStateEntrySnapshot {
  return Object.freeze({
    confirmedSequence: entry.confirmedSequence,
    inFlightSequence: entry.inFlightSequence,
    lastError: entry.lastError,
    pendingSequence: entry.pendingSequence,
    retryAttempt: entry.retryAttempt,
    status: entry.status,
  });
}

function assertSequence(sequence: number, field: string): void {
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    throw new RangeError(`${field}는 0 이상의 안전한 정수여야 합니다.`);
  }
}

function assertDelay(delayMs: number, field: string): void {
  if (!Number.isSafeInteger(delayMs) || delayMs < 0) {
    throw new RangeError(`${field}는 0 이상의 안전한 정수여야 합니다.`);
  }
}
