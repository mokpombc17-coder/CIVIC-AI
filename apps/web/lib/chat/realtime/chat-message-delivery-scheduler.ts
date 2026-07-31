import { roomIdSchema } from "../chat-room-contracts";
import {
  calculateChatMessageAdmissionRetryDelay,
  DEFAULT_CHAT_MESSAGE_ADMISSION_RETRY_POLICY,
  selectChatMessageAdmissionRetrySignal,
  type ChatMessageAdmissionRetryPolicy,
} from "./chat-message-admission-control";
import {
  chatMessageSendRequestSchema,
  type ChatMessageCommandResult,
  type ChatMessageSendRequest,
} from "./chat-stomp-contracts";

export type ChatMessageDeliveryStatus = "sending" | "retry-waiting";

export type ChatMessageDeliverySnapshot = Readonly<{
  attempt: number;
  firstSentAt: number;
  generation: number;
  ownerId: string;
  previousDelayMs: number | null;
  request: ChatMessageSendRequest;
  roomId: string;
  scheduledAt: number | null;
  status: ChatMessageDeliveryStatus;
}>;

export type ChatMessageDeliveryPublishCommand = Readonly<{
  request: ChatMessageSendRequest;
  roomId: string;
}>;

export type ChatMessageDeliveryFailureReason =
  | "COMMAND_FAILED"
  | "COMMAND_REJECTED"
  | "COMMAND_RESULT_TIMEOUT"
  | "CONTEXT_VALIDATION_FAILED"
  | "MAX_ATTEMPTS_REACHED"
  | "MAX_ELAPSED_TIME_REACHED"
  | "PUBLISH_FAILED";

export type ChatMessageDeliveryTerminalEvent =
  | Readonly<{
      kind: "sent";
      result: Extract<ChatMessageCommandResult, { status: "ACCEPTED" | "DUPLICATE" }>;
      snapshot: ChatMessageDeliverySnapshot;
    }>
  | Readonly<{
      cause?: unknown;
      kind: "failed";
      reason: ChatMessageDeliveryFailureReason;
      result?: Extract<ChatMessageCommandResult, { status: "FAILED" | "REJECTED" }>;
      snapshot: ChatMessageDeliverySnapshot;
    }>
  | Readonly<{
      kind: "cancelled";
      reason: string;
      snapshot: ChatMessageDeliverySnapshot;
    }>;

export type ChatMessageDeliveryLimits = Readonly<{
  commandResultTimeoutMs: number;
  maxAttempts: number;
  maxElapsedMs: number;
}>;

export const DEFAULT_CHAT_MESSAGE_DELIVERY_LIMITS: ChatMessageDeliveryLimits = Object.freeze({
  commandResultTimeoutMs: 15_000,
  maxAttempts: 5,
  maxElapsedMs: 60_000,
});

export type StartChatMessageDeliveryInput = Readonly<{
  generation: number;
  ownerId: string;
  request: ChatMessageSendRequest;
  roomId: string;
}>;

type ChatMessageDeliveryTimerHandle = ReturnType<typeof setTimeout>;

export type ChatMessageDeliverySchedulerOptions = Readonly<{
  admissionRetryPolicy?: ChatMessageAdmissionRetryPolicy;
  cancelTimer?: (handle: ChatMessageDeliveryTimerHandle) => void;
  isContextCurrent?: (snapshot: ChatMessageDeliverySnapshot) => boolean;
  limits?: ChatMessageDeliveryLimits;
  now?: () => number;
  onStateChange?: (snapshot: ChatMessageDeliverySnapshot) => void;
  onTerminal?: (event: ChatMessageDeliveryTerminalEvent) => void;
  publish: (command: ChatMessageDeliveryPublishCommand) => void;
  random?: () => number;
  scheduleTimer?: (callback: () => void, delayMs: number) => ChatMessageDeliveryTimerHandle;
}>;

type ActiveChatMessageDelivery = {
  attempt: number;
  firstSentAt: number;
  generation: number;
  ownerId: string;
  previousDelayMs: number | null;
  request: ChatMessageSendRequest;
  roomId: string;
  scheduledAt: number | null;
  status: ChatMessageDeliveryStatus;
  timerHandle: ChatMessageDeliveryTimerHandle | null;
};

export class ChatMessageDeliveryScheduler {
  private readonly admissionRetryPolicy: ChatMessageAdmissionRetryPolicy;
  private readonly cancelTimer: (handle: ChatMessageDeliveryTimerHandle) => void;
  private readonly deliveries = new Map<string, ActiveChatMessageDelivery>();
  private readonly isContextCurrent: (snapshot: ChatMessageDeliverySnapshot) => boolean;
  private readonly limits: ChatMessageDeliveryLimits;
  private readonly now: () => number;
  private readonly onStateChange: (snapshot: ChatMessageDeliverySnapshot) => void;
  private readonly onTerminal: (event: ChatMessageDeliveryTerminalEvent) => void;
  private readonly publish: (command: ChatMessageDeliveryPublishCommand) => void;
  private readonly random: () => number;
  private readonly scheduleTimer: (
    callback: () => void,
    delayMs: number,
  ) => ChatMessageDeliveryTimerHandle;
  private disposed = false;

  constructor({
    admissionRetryPolicy = DEFAULT_CHAT_MESSAGE_ADMISSION_RETRY_POLICY,
    cancelTimer = (handle) => globalThis.clearTimeout(handle),
    isContextCurrent = () => true,
    limits = DEFAULT_CHAT_MESSAGE_DELIVERY_LIMITS,
    now = Date.now,
    onStateChange = () => undefined,
    onTerminal = () => undefined,
    publish,
    random = Math.random,
    scheduleTimer = (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  }: ChatMessageDeliverySchedulerOptions) {
    assertDeliveryLimits(limits);

    this.admissionRetryPolicy = admissionRetryPolicy;
    this.cancelTimer = cancelTimer;
    this.isContextCurrent = isContextCurrent;
    this.limits = limits;
    this.now = now;
    this.onStateChange = onStateChange;
    this.onTerminal = onTerminal;
    this.publish = publish;
    this.random = random;
    this.scheduleTimer = scheduleTimer;
  }

  get size(): number {
    return this.deliveries.size;
  }

  start(input: StartChatMessageDeliveryInput): ChatMessageDeliverySnapshot {
    if (this.disposed) {
      throw new Error("폐기된 메시지 delivery scheduler는 다시 사용할 수 없습니다.");
    }

    const roomId = roomIdSchema.parse(input.roomId);
    const request = Object.freeze(chatMessageSendRequestSchema.parse(input.request));
    const ownerId = assertOwnerId(input.ownerId);
    const generation = assertGeneration(input.generation);
    const firstSentAt = this.readNow();

    if (this.deliveries.has(request.clientMessageId)) {
      throw new Error(`clientMessageId ${request.clientMessageId}는 이미 전송 중입니다.`);
    }

    const delivery: ActiveChatMessageDelivery = {
      attempt: 1,
      firstSentAt,
      generation,
      ownerId,
      previousDelayMs: null,
      request,
      roomId,
      scheduledAt: null,
      status: "sending",
      timerHandle: null,
    };

    this.deliveries.set(request.clientMessageId, delivery);
    this.emitStateChange(delivery);
    this.publishAttempt(delivery);

    return createSnapshot(delivery);
  }

  getSnapshot(clientMessageId: string): ChatMessageDeliverySnapshot | null {
    const delivery = this.deliveries.get(clientMessageId);
    return delivery ? createSnapshot(delivery) : null;
  }

  handleCommandResult(result: ChatMessageCommandResult): boolean {
    const delivery = this.deliveries.get(result.clientMessageId);

    if (!delivery || delivery.status !== "sending") {
      return false;
    }

    this.clearActiveTimer(delivery);

    if (result.status === "ACCEPTED" || result.status === "DUPLICATE") {
      this.finish(delivery, {
        kind: "sent",
        result,
        snapshot: createSnapshot(delivery),
      });
      return true;
    }

    const retrySignal = selectChatMessageAdmissionRetrySignal(result);

    if (retrySignal && result.status === "REJECTED") {
      this.scheduleRetry(delivery, retrySignal, result);
      return true;
    }

    this.finish(delivery, {
      kind: "failed",
      reason: result.status === "REJECTED" ? "COMMAND_REJECTED" : "COMMAND_FAILED",
      result,
      snapshot: createSnapshot(delivery),
    });
    return true;
  }

  cancel(clientMessageId: string, reason: string): boolean {
    const delivery = this.deliveries.get(clientMessageId);

    if (!delivery) {
      return false;
    }

    this.finish(delivery, {
      kind: "cancelled",
      reason: assertCancellationReason(reason),
      snapshot: createSnapshot(delivery),
    });
    return true;
  }

  cancelMatching(
    predicate: (snapshot: ChatMessageDeliverySnapshot) => boolean,
    reason: string,
  ): number {
    const cancellationReason = assertCancellationReason(reason);
    const deliveries = [...this.deliveries.values()].filter((delivery) =>
      predicate(createSnapshot(delivery)),
    );

    deliveries.forEach((delivery) => {
      this.finish(delivery, {
        kind: "cancelled",
        reason: cancellationReason,
        snapshot: createSnapshot(delivery),
      });
    });

    return deliveries.length;
  }

  cancelAll(reason: string): number {
    return this.cancelMatching(() => true, reason);
  }

  dispose(reason = "SCHEDULER_DISPOSED"): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.cancelAll(reason);
  }

  private publishAttempt(delivery: ActiveChatMessageDelivery): void {
    try {
      this.publish({
        request: delivery.request,
        roomId: delivery.roomId,
      });
    } catch (cause) {
      this.finish(delivery, {
        cause,
        kind: "failed",
        reason: "PUBLISH_FAILED",
        snapshot: createSnapshot(delivery),
      });
      return;
    }

    this.armCommandResultTimeout(delivery);
  }

  private scheduleRetry(
    delivery: ActiveChatMessageDelivery,
    signal: NonNullable<ReturnType<typeof selectChatMessageAdmissionRetrySignal>>,
    result: Extract<ChatMessageCommandResult, { status: "REJECTED" }>,
  ): void {
    if (delivery.attempt >= this.limits.maxAttempts) {
      this.finish(delivery, {
        kind: "failed",
        reason: "MAX_ATTEMPTS_REACHED",
        result,
        snapshot: createSnapshot(delivery),
      });
      return;
    }

    const now = this.readNow();
    const delayMs = calculateChatMessageAdmissionRetryDelay({
      policy: this.admissionRetryPolicy,
      previousDelayMs: delivery.previousDelayMs,
      randomFraction: this.random(),
      signal,
    });
    const scheduledAt = safeAdd(now, delayMs, "메시지 재전송 예정 시각");

    if (scheduledAt - delivery.firstSentAt >= this.limits.maxElapsedMs) {
      this.finish(delivery, {
        kind: "failed",
        reason: "MAX_ELAPSED_TIME_REACHED",
        result,
        snapshot: createSnapshot(delivery),
      });
      return;
    }

    delivery.previousDelayMs = delayMs;
    delivery.scheduledAt = scheduledAt;
    delivery.status = "retry-waiting";
    this.emitStateChange(delivery);
    delivery.timerHandle = this.scheduleTimer(
      () => this.retryDelivery(delivery.request.clientMessageId),
      delayMs,
    );
  }

  private retryDelivery(clientMessageId: string): void {
    const delivery = this.deliveries.get(clientMessageId);

    if (!delivery || delivery.status !== "retry-waiting") {
      return;
    }

    delivery.timerHandle = null;

    const snapshot = createSnapshot(delivery);
    let contextIsCurrent: boolean;

    try {
      contextIsCurrent = this.isContextCurrent(snapshot);
    } catch (cause) {
      this.finish(delivery, {
        cause,
        kind: "failed",
        reason: "CONTEXT_VALIDATION_FAILED",
        snapshot,
      });
      return;
    }

    if (!contextIsCurrent) {
      this.finish(delivery, {
        kind: "cancelled",
        reason: "DELIVERY_CONTEXT_STALE",
        snapshot,
      });
      return;
    }

    if (this.readNow() - delivery.firstSentAt >= this.limits.maxElapsedMs) {
      this.finish(delivery, {
        kind: "failed",
        reason: "MAX_ELAPSED_TIME_REACHED",
        snapshot,
      });
      return;
    }

    delivery.attempt += 1;
    delivery.scheduledAt = null;
    delivery.status = "sending";
    this.emitStateChange(delivery);
    this.publishAttempt(delivery);
  }

  private armCommandResultTimeout(delivery: ActiveChatMessageDelivery): void {
    const remainingMs = this.limits.maxElapsedMs - (this.readNow() - delivery.firstSentAt);
    const timeoutMs = Math.min(this.limits.commandResultTimeoutMs, remainingMs);

    if (timeoutMs <= 0) {
      this.finish(delivery, {
        kind: "failed",
        reason: "MAX_ELAPSED_TIME_REACHED",
        snapshot: createSnapshot(delivery),
      });
      return;
    }

    delivery.timerHandle = this.scheduleTimer(() => {
      const activeDelivery = this.deliveries.get(delivery.request.clientMessageId);

      if (!activeDelivery || activeDelivery.status !== "sending") {
        return;
      }

      activeDelivery.timerHandle = null;
      const elapsedMs = this.readNow() - activeDelivery.firstSentAt;
      this.finish(activeDelivery, {
        kind: "failed",
        reason:
          elapsedMs >= this.limits.maxElapsedMs
            ? "MAX_ELAPSED_TIME_REACHED"
            : "COMMAND_RESULT_TIMEOUT",
        snapshot: createSnapshot(activeDelivery),
      });
    }, timeoutMs);
  }

  private clearActiveTimer(delivery: ActiveChatMessageDelivery): void {
    if (delivery.timerHandle === null) {
      return;
    }

    this.cancelTimer(delivery.timerHandle);
    delivery.timerHandle = null;
  }

  private emitStateChange(delivery: ActiveChatMessageDelivery): void {
    this.onStateChange(createSnapshot(delivery));
  }

  private finish(
    delivery: ActiveChatMessageDelivery,
    event: ChatMessageDeliveryTerminalEvent,
  ): void {
    if (this.deliveries.get(delivery.request.clientMessageId) !== delivery) {
      return;
    }

    this.clearActiveTimer(delivery);
    this.deliveries.delete(delivery.request.clientMessageId);
    this.onTerminal(event);
  }

  private readNow(): number {
    const now = this.now();

    if (!Number.isSafeInteger(now) || now < 0) {
      throw new RangeError("현재 시각은 0 이상의 안전한 정수 millisecond여야 합니다.");
    }

    return now;
  }
}

function createSnapshot(delivery: ActiveChatMessageDelivery): ChatMessageDeliverySnapshot {
  return Object.freeze({
    attempt: delivery.attempt,
    firstSentAt: delivery.firstSentAt,
    generation: delivery.generation,
    ownerId: delivery.ownerId,
    previousDelayMs: delivery.previousDelayMs,
    request: delivery.request,
    roomId: delivery.roomId,
    scheduledAt: delivery.scheduledAt,
    status: delivery.status,
  });
}

function assertDeliveryLimits(limits: ChatMessageDeliveryLimits): void {
  assertPositiveInteger(limits.commandResultTimeoutMs, "commandResultTimeoutMs");
  assertPositiveInteger(limits.maxAttempts, "maxAttempts");
  assertPositiveInteger(limits.maxElapsedMs, "maxElapsedMs");

  if (limits.maxElapsedMs < limits.commandResultTimeoutMs) {
    throw new RangeError("maxElapsedMs는 commandResultTimeoutMs 이상이어야 합니다.");
  }
}

function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${field}는 1 이상의 안전한 정수여야 합니다.`);
  }
}

function assertOwnerId(ownerId: string): string {
  if (ownerId.trim().length === 0) {
    throw new TypeError("ownerId는 비어 있지 않은 문자열이어야 합니다.");
  }

  return ownerId;
}

function assertGeneration(generation: number): number {
  if (!Number.isSafeInteger(generation) || generation < 0) {
    throw new RangeError("generation은 0 이상의 안전한 정수여야 합니다.");
  }

  return generation;
}

function assertCancellationReason(reason: string): string {
  if (reason.trim().length === 0) {
    throw new TypeError("메시지 delivery 취소 사유는 비어 있을 수 없습니다.");
  }

  return reason;
}

function safeAdd(left: number, right: number, field: string): number {
  const result = left + right;

  if (!Number.isSafeInteger(result)) {
    throw new RangeError(`${field}이 안전한 정수 범위를 벗어났습니다.`);
  }

  return result;
}
