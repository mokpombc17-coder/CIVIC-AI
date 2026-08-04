export const ROOM_READ_STATE_DEBOUNCE_MS = 400;
export const ROOM_READ_STATE_MAX_WAIT_MS = 1_500;

type SubmitReadState = (throughSequence: number) => Promise<number>;

type ChatRoomReadStateSchedulerOptions = Readonly<{
  debounceMs?: number;
  maxWaitMs?: number;
  onError?: (error: unknown) => void;
  submit: SubmitReadState;
}>;

export class ChatRoomReadStateScheduler {
  private readonly debounceMs: number;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private inFlight = false;
  private lastConfirmedSequence = 0;
  private readonly maxWaitMs: number;
  private maxWaitTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly onError: (error: unknown) => void;
  private pendingSequence: number | null = null;
  private readonly submit: SubmitReadState;

  constructor({
    debounceMs = ROOM_READ_STATE_DEBOUNCE_MS,
    maxWaitMs = ROOM_READ_STATE_MAX_WAIT_MS,
    onError = () => undefined,
    submit,
  }: ChatRoomReadStateSchedulerOptions) {
    assertDelay(debounceMs, "debounceMs");
    assertDelay(maxWaitMs, "maxWaitMs");

    if (maxWaitMs < debounceMs) {
      throw new RangeError("maxWaitMs는 debounceMs 이상이어야 합니다.");
    }

    this.debounceMs = debounceMs;
    this.maxWaitMs = maxWaitMs;
    this.onError = onError;
    this.submit = submit;
  }

  schedule(throughSequence: number): void {
    assertSequence(throughSequence);

    if (throughSequence <= this.lastConfirmedSequence) {
      return;
    }

    this.pendingSequence = Math.max(this.pendingSequence ?? 0, throughSequence);

    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => this.flush(), this.debounceMs);
    this.maxWaitTimer ??= setTimeout(() => this.flush(), this.maxWaitMs);
  }

  flush(): void {
    this.clearTimers();

    if (this.inFlight) {
      return;
    }

    const throughSequence = this.pendingSequence;

    if (throughSequence === null || throughSequence <= this.lastConfirmedSequence) {
      this.pendingSequence = null;
      return;
    }

    this.pendingSequence = null;
    this.inFlight = true;

    void this.submit(throughSequence)
      .then((readThroughSequence) => {
        assertSequence(readThroughSequence);
        this.lastConfirmedSequence = Math.max(this.lastConfirmedSequence, readThroughSequence);
      })
      .catch(this.onError)
      .finally(() => {
        this.inFlight = false;

        if (this.pendingSequence !== null) {
          this.flush();
        }
      });
  }

  private clearTimers(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.maxWaitTimer !== null) {
      clearTimeout(this.maxWaitTimer);
      this.maxWaitTimer = null;
    }
  }
}

function assertSequence(sequence: number): void {
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    throw new RangeError("throughSequence는 0 이상의 안전한 정수여야 합니다.");
  }
}

function assertDelay(delayMs: number, field: string): void {
  if (!Number.isSafeInteger(delayMs) || delayMs < 0) {
    throw new RangeError(`${field}는 0 이상의 안전한 정수여야 합니다.`);
  }
}
