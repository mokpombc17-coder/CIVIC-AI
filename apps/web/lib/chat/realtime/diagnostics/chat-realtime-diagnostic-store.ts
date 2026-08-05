import {
  CHAT_REALTIME_DIAGNOSTIC_SCHEMA_VERSION,
  chatRealtimeDiagnosticEventSchema,
  getChatRealtimeDiagnosticLevel,
  type ChatRealtimeDiagnosticEvent,
  type ChatRealtimeDiagnosticEventInput,
  type ChatRealtimeDiagnosticSnapshot,
} from "./chat-realtime-diagnostic-events";

const DEFAULT_CAPACITY = 500;

type ChatRealtimeDiagnosticStoreOptions = Readonly<{
  runtimeInstanceId: string;
  capacity?: number;
  enabled?: boolean;
  now?: () => Date;
  monotonicNow?: () => number;
}>;

export class ChatRealtimeDiagnosticStore {
  private readonly capacity: number;
  private readonly enabled: boolean;
  private readonly events: Array<ChatRealtimeDiagnosticEvent | undefined>;
  private readonly monotonicNow: () => number;
  private readonly now: () => Date;
  private readonly runtimeInstanceId: string;
  private droppedEventCount = 0;
  private nextIndex = 0;
  private rejectedEventCount = 0;
  private sequence = 0;
  private size = 0;

  constructor({
    runtimeInstanceId,
    capacity = DEFAULT_CAPACITY,
    enabled = process.env.NODE_ENV === "development",
    now = () => new Date(),
    monotonicNow = () => performance.now(),
  }: ChatRealtimeDiagnosticStoreOptions) {
    if (!runtimeInstanceId.trim()) {
      throw new Error("runtimeInstanceId는 비어 있을 수 없습니다.");
    }

    if (!Number.isSafeInteger(capacity) || capacity < 1) {
      throw new Error("진단 로그 capacity는 1 이상의 안전한 정수여야 합니다.");
    }

    this.capacity = capacity;
    this.enabled = enabled;
    this.events = Array.from({ length: capacity });
    this.monotonicNow = monotonicNow;
    this.now = now;
    this.runtimeInstanceId = runtimeInstanceId;
  }

  emit(input: ChatRealtimeDiagnosticEventInput): void {
    if (!this.enabled) {
      return;
    }

    try {
      const event = {
        ...input,
        eventVersion: CHAT_REALTIME_DIAGNOSTIC_SCHEMA_VERSION,
        sequence: this.sequence + 1,
        occurredAt: this.now().toISOString(),
        elapsedMs: this.monotonicNow(),
        runtimeInstanceId: this.runtimeInstanceId,
        level: getChatRealtimeDiagnosticLevel(input.event),
      };
      const parsed = chatRealtimeDiagnosticEventSchema.safeParse(event);

      if (!parsed.success) {
        this.rejectedEventCount += 1;
        return;
      }

      this.sequence += 1;
      this.events[this.nextIndex] = Object.freeze(parsed.data);
      this.nextIndex = (this.nextIndex + 1) % this.capacity;

      if (this.size === this.capacity) {
        this.droppedEventCount += 1;
        return;
      }

      this.size += 1;
    } catch {
      this.rejectedEventCount += 1;
    }
  }

  clear(): void {
    this.events.fill(undefined);
    this.droppedEventCount = 0;
    this.nextIndex = 0;
    this.rejectedEventCount = 0;
    this.size = 0;
  }

  getSnapshot(): ChatRealtimeDiagnosticSnapshot {
    const events = Array.from({ length: this.size }, (_, offset) => {
      const startIndex = (this.nextIndex - this.size + this.capacity) % this.capacity;
      return this.events[(startIndex + offset) % this.capacity]!;
    });

    return Object.freeze({
      schemaVersion: CHAT_REALTIME_DIAGNOSTIC_SCHEMA_VERSION,
      capturedAt: this.now().toISOString(),
      capacity: this.capacity,
      droppedEventCount: this.droppedEventCount,
      rejectedEventCount: this.rejectedEventCount,
      events: Object.freeze(events),
    });
  }
}
