import { idempotencyKeySchema, roomIdSchema } from "../chat-room-contracts";
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

export type ChatMessageDeliveryStatus = "queued" | "sending" | "retry-waiting";
export type ChatMessageDeliveryLifecycleStatus =
  ChatMessageDeliveryStatus | "sent" | "failed" | "cancelled";

export type ChatMessageDeliverySnapshot = Readonly<{
  attempt: number;
  enqueuedAt: number;
  firstSentAt: number | null;
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

export type ChatMessageDeliveryLifecycleEvent = Readonly<{
  attempt: number;
  clientMessageId: string;
  generation: number;
  reason: string | null;
  retryAt: number | null;
  roomId: string;
  status: ChatMessageDeliveryLifecycleStatus;
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
  maxPendingMessages?: number;
  now?: () => number;
  onStateChange?: (snapshot: ChatMessageDeliverySnapshot) => void;
  onTerminal?: (event: ChatMessageDeliveryTerminalEvent) => void;
  publish: (command: ChatMessageDeliveryPublishCommand) => void;
  random?: () => number;
  scheduleTimer?: (callback: () => void, delayMs: number) => ChatMessageDeliveryTimerHandle;
}>;

type ActiveChatMessageDelivery = {
  attempt: number;
  enqueuedAt: number;
  firstSentAt: number | null;
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
  private activeClientMessageId: string | null = null;
  private readonly admissionRetryPolicy: ChatMessageAdmissionRetryPolicy;
  private readonly cancelTimer: (handle: ChatMessageDeliveryTimerHandle) => void;
  private readonly deliveries = new Map<string, ActiveChatMessageDelivery>();
  private readonly isContextCurrent: (snapshot: ChatMessageDeliverySnapshot) => boolean;
  private readonly limits: ChatMessageDeliveryLimits;
  private readonly maxPendingMessages: number;
  private readonly now: () => number;
  private readonly onStateChange: (snapshot: ChatMessageDeliverySnapshot) => void;
  private readonly onTerminal: (event: ChatMessageDeliveryTerminalEvent) => void;
  private readonly publish: (command: ChatMessageDeliveryPublishCommand) => void;
  private readonly random: () => number;
  private readonly queue: string[] = [];
  private readonly scheduleTimer: (
    callback: () => void,
    delayMs: number,
  ) => ChatMessageDeliveryTimerHandle;
  private disposed = false;
  private pumpSuspended = false;

  constructor({
    admissionRetryPolicy = DEFAULT_CHAT_MESSAGE_ADMISSION_RETRY_POLICY,
    cancelTimer = (handle) => globalThis.clearTimeout(handle),
    isContextCurrent = () => true,
    limits = DEFAULT_CHAT_MESSAGE_DELIVERY_LIMITS,
    maxPendingMessages = 20,
    now = Date.now,
    onStateChange = () => undefined,
    onTerminal = () => undefined,
    publish,
    random = Math.random,
    scheduleTimer = (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  }: ChatMessageDeliverySchedulerOptions) {
    assertDeliveryLimits(limits);
    assertPositiveInteger(maxPendingMessages, "maxPendingMessages");

    this.admissionRetryPolicy = admissionRetryPolicy;
    this.cancelTimer = cancelTimer;
    this.isContextCurrent = isContextCurrent;
    this.limits = limits;
    this.maxPendingMessages = maxPendingMessages;
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
    const enqueuedAt = this.readNow();

    if (this.deliveries.has(request.clientMessageId)) {
      throw new Error(`clientMessageId ${request.clientMessageId}는 이미 전송 중입니다.`);
    }

    if (this.deliveries.size >= this.maxPendingMessages) {
      throw new Error(
        `메시지 전송 대기열은 최대 ${this.maxPendingMessages}개까지 보관할 수 있습니다.`,
      );
    }

    const delivery: ActiveChatMessageDelivery = {
      attempt: 0,
      enqueuedAt,
      firstSentAt: null,
      generation,
      ownerId,
      previousDelayMs: null,
      request,
      roomId,
      scheduledAt: null,
      status: "queued",
      timerHandle: null,
    };

    this.deliveries.set(request.clientMessageId, delivery);
    this.queue.push(request.clientMessageId);
    this.emitStateChange(delivery);
    this.pump();

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

    this.pumpSuspended = true;

    try {
      deliveries.forEach((delivery) => {
        this.finish(delivery, {
          kind: "cancelled",
          reason: cancellationReason,
          snapshot: createSnapshot(delivery),
        });
      });
    } finally {
      this.pumpSuspended = false;
      this.pump();
    }

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

  private pump(): void {
    if (this.disposed || this.pumpSuspended || this.activeClientMessageId !== null) {
      return;
    }

    while (this.queue.length > 0) {
      const clientMessageId = this.queue.shift()!;
      const delivery = this.deliveries.get(clientMessageId);

      if (!delivery || delivery.status !== "queued") {
        continue;
      }

      this.activeClientMessageId = clientMessageId;
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

      delivery.attempt = 1;
      delivery.firstSentAt = this.readNow();
      delivery.status = "sending";
      this.emitStateChange(delivery);
      this.publishAttempt(delivery);
      return;
    }
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

    const firstSentAt = requireFirstSentAt(delivery);

    if (scheduledAt - firstSentAt >= this.limits.maxElapsedMs) {
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

    if (this.readNow() - requireFirstSentAt(delivery) >= this.limits.maxElapsedMs) {
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
    const remainingMs = this.limits.maxElapsedMs - (this.readNow() - requireFirstSentAt(delivery));
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
      const elapsedMs = this.readNow() - requireFirstSentAt(activeDelivery);
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
    const queueIndex = this.queue.indexOf(delivery.request.clientMessageId);

    if (queueIndex >= 0) {
      this.queue.splice(queueIndex, 1);
    }

    if (this.activeClientMessageId === delivery.request.clientMessageId) {
      this.activeClientMessageId = null;
    }

    this.onTerminal(event);
    this.pump();
  }

  private readNow(): number {
    const now = this.now();

    if (!Number.isSafeInteger(now) || now < 0) {
      throw new RangeError("현재 시각은 0 이상의 안전한 정수 millisecond여야 합니다.");
    }

    return now;
  }
}

export function getChatMessageDeliveryFailureMessage(
  event: Extract<ChatMessageDeliveryTerminalEvent, { kind: "failed" }>,
): string {
  switch (event.reason) {
    case "COMMAND_RESULT_TIMEOUT":
      return "채팅 서버의 메시지 처리 결과를 시간 안에 받지 못했습니다.";
    case "CONTEXT_VALIDATION_FAILED":
      return "현재 채팅방 전송 상태를 확인하지 못해 메시지 전송을 중단했습니다.";
    case "MAX_ATTEMPTS_REACHED":
      return "메시지 자동 재전송 횟수를 초과했습니다.";
    case "MAX_ELAPSED_TIME_REACHED":
      return "메시지 자동 재전송 제한 시간을 초과했습니다.";
    case "PUBLISH_FAILED":
      return event.cause instanceof Error && event.cause.message.trim()
        ? event.cause.message
        : "STOMP 메시지 전송에 실패했습니다.";
    case "COMMAND_FAILED":
    case "COMMAND_REJECTED":
      return "채팅 서버가 메시지 전송을 거절했습니다.";
  }
}

export function createChatMessageDeliveryStateLifecycleEvent(
  snapshot: ChatMessageDeliverySnapshot,
): ChatMessageDeliveryLifecycleEvent {
  const retryAt = snapshot.status === "retry-waiting" ? snapshot.scheduledAt : null;

  if (snapshot.status === "retry-waiting" && retryAt === null) {
    throw new Error("재전송 대기 상태에는 scheduledAt이 필요합니다.");
  }

  return {
    attempt: snapshot.attempt,
    clientMessageId: snapshot.request.clientMessageId,
    generation: snapshot.generation,
    reason: null,
    retryAt,
    roomId: snapshot.roomId,
    status: snapshot.status,
  };
}

export function createChatMessageDeliveryTerminalLifecycleEvent(
  event: ChatMessageDeliveryTerminalEvent,
): ChatMessageDeliveryLifecycleEvent {
  return {
    attempt: event.snapshot.attempt,
    clientMessageId: event.snapshot.request.clientMessageId,
    generation: event.snapshot.generation,
    reason: event.kind === "sent" ? null : event.reason,
    retryAt: null,
    roomId: event.snapshot.roomId,
    status: event.kind,
  };
}

export function isChatMessageDeliveryLifecycleEvent(
  value: unknown,
): value is ChatMessageDeliveryLifecycleEvent {
  if (!value || typeof value !== "object") {
    return false;
  }

  const event = value as Partial<ChatMessageDeliveryLifecycleEvent>;
  const statusIsValid =
    event.status === "queued" ||
    event.status === "sending" ||
    event.status === "retry-waiting" ||
    event.status === "sent" ||
    event.status === "failed" ||
    event.status === "cancelled";
  const hasRetryAt =
    event.status === "retry-waiting"
      ? typeof event.retryAt === "number" &&
        Number.isSafeInteger(event.retryAt) &&
        event.retryAt >= 0
      : event.retryAt === null;
  const hasReason =
    event.status === "failed" || event.status === "cancelled"
      ? typeof event.reason === "string" && event.reason.length > 0
      : event.reason === null;

  return (
    Number.isSafeInteger(event.attempt) &&
    (event.status === "queued" ? event.attempt === 0 : (event.attempt ?? 0) >= 1) &&
    idempotencyKeySchema.safeParse(event.clientMessageId).success &&
    Number.isSafeInteger(event.generation) &&
    (event.generation ?? -1) >= 0 &&
    roomIdSchema.safeParse(event.roomId).success &&
    statusIsValid &&
    hasRetryAt &&
    hasReason
  );
}

function createSnapshot(delivery: ActiveChatMessageDelivery): ChatMessageDeliverySnapshot {
  return Object.freeze({
    attempt: delivery.attempt,
    enqueuedAt: delivery.enqueuedAt,
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

function requireFirstSentAt(delivery: ActiveChatMessageDelivery): number {
  if (delivery.firstSentAt === null) {
    throw new Error("메시지를 publish하기 전에는 전송 제한 시간을 계산할 수 없습니다.");
  }

  return delivery.firstSentAt;
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
