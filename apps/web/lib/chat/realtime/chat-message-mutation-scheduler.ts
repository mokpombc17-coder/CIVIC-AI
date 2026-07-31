import { roomIdSchema } from "../chat-room-contracts";
import {
  calculateChatMessageAdmissionRetryDelay,
  DEFAULT_CHAT_MESSAGE_ADMISSION_RETRY_POLICY,
  type ChatMessageAdmissionRetryPolicy,
} from "./chat-message-admission-control";
import {
  chatMessageDeleteRequestSchema,
  chatMessageEditRequestSchema,
  type ChatMessageDeleteRequest,
  type ChatMessageEditRequest,
  type ChatMessageMutationCommandResult,
  type ChatMessageMutationCommandType,
} from "./chat-stomp-contracts";

export type ChatMessageMutationRequest = ChatMessageEditRequest | ChatMessageDeleteRequest;
export type ChatMessageMutationDeliveryStatus = "queued" | "sending" | "retry-waiting";
export type ChatMessageMutationLifecycleStatus =
  ChatMessageMutationDeliveryStatus | "completed" | "failed" | "cancelled";

export type ChatMessageMutationSnapshot = Readonly<{
  attempt: number;
  commandType: ChatMessageMutationCommandType;
  enqueuedAt: number;
  firstSentAt: number | null;
  generation: number;
  ownerId: string;
  previousDelayMs: number | null;
  request: ChatMessageMutationRequest;
  roomId: string;
  scheduledAt: number | null;
  status: ChatMessageMutationDeliveryStatus;
}>;

export type ChatMessageMutationPublishCommand =
  | Readonly<{
      commandType: "EDIT_MESSAGE";
      request: ChatMessageEditRequest;
      roomId: string;
    }>
  | Readonly<{
      commandType: "DELETE_MESSAGE";
      request: ChatMessageDeleteRequest;
      roomId: string;
    }>;

export type ChatMessageMutationFailureReason =
  | "COMMAND_FAILED"
  | "COMMAND_REJECTED"
  | "COMMAND_RESULT_TIMEOUT"
  | "CONTEXT_VALIDATION_FAILED"
  | "MAX_ATTEMPTS_REACHED"
  | "MAX_ELAPSED_TIME_REACHED"
  | "PUBLISH_FAILED";

type ChatMessageMutationSuccessResult = Extract<ChatMessageMutationCommandResult, { code: null }>;
type ChatMessageMutationFailureResult = Exclude<
  ChatMessageMutationCommandResult,
  ChatMessageMutationSuccessResult
>;

export type ChatMessageMutationTerminalEvent =
  | Readonly<{
      kind: "completed";
      result: ChatMessageMutationSuccessResult;
      snapshot: ChatMessageMutationSnapshot;
    }>
  | Readonly<{
      cause?: unknown;
      kind: "failed";
      reason: ChatMessageMutationFailureReason;
      result?: ChatMessageMutationFailureResult | undefined;
      snapshot: ChatMessageMutationSnapshot;
    }>
  | Readonly<{
      kind: "cancelled";
      reason: string;
      snapshot: ChatMessageMutationSnapshot;
    }>;

export type ChatMessageMutationLifecycleEvent = Readonly<{
  attempt: number;
  clientMutationId: string;
  commandType: ChatMessageMutationCommandType;
  generation: number;
  messageId: string;
  reason: string | null;
  retryAt: number | null;
  roomId: string;
  status: ChatMessageMutationLifecycleStatus;
}>;

export type StartChatMessageMutationInput =
  | Readonly<{
      commandType: "EDIT_MESSAGE";
      generation: number;
      ownerId: string;
      request: ChatMessageEditRequest;
      roomId: string;
    }>
  | Readonly<{
      commandType: "DELETE_MESSAGE";
      generation: number;
      ownerId: string;
      request: ChatMessageDeleteRequest;
      roomId: string;
    }>;

type MutationTimerHandle = ReturnType<typeof setTimeout>;

export type ChatMessageMutationLimits = Readonly<{
  commandResultTimeoutMs: number;
  maxAttempts: number;
  maxElapsedMs: number;
}>;

export type ChatMessageMutationSchedulerOptions = Readonly<{
  admissionRetryPolicy?: ChatMessageAdmissionRetryPolicy;
  cancelTimer?: (handle: MutationTimerHandle) => void;
  isContextCurrent?: (snapshot: ChatMessageMutationSnapshot) => boolean;
  limits?: ChatMessageMutationLimits;
  maxPendingMutations?: number;
  now?: () => number;
  onStateChange?: (snapshot: ChatMessageMutationSnapshot) => void;
  onTerminal?: (event: ChatMessageMutationTerminalEvent) => void;
  publish: (command: ChatMessageMutationPublishCommand) => void;
  random?: () => number;
  scheduleTimer?: (callback: () => void, delayMs: number) => MutationTimerHandle;
}>;

type ActiveMutation = {
  attempt: number;
  commandType: ChatMessageMutationCommandType;
  enqueuedAt: number;
  firstSentAt: number | null;
  generation: number;
  ownerId: string;
  previousDelayMs: number | null;
  request: ChatMessageMutationRequest;
  roomId: string;
  scheduledAt: number | null;
  status: ChatMessageMutationDeliveryStatus;
  timerHandle: MutationTimerHandle | null;
};

const DEFAULT_LIMITS: ChatMessageMutationLimits = Object.freeze({
  commandResultTimeoutMs: 15_000,
  maxAttempts: 5,
  maxElapsedMs: 60_000,
});

export class ChatMessageMutationScheduler {
  private activeClientMutationId: string | null = null;
  private readonly admissionRetryPolicy: ChatMessageAdmissionRetryPolicy;
  private readonly cancelTimer: (handle: MutationTimerHandle) => void;
  private disposed = false;
  private readonly isContextCurrent: (snapshot: ChatMessageMutationSnapshot) => boolean;
  private readonly limits: ChatMessageMutationLimits;
  private readonly maxPendingMutations: number;
  private readonly mutations = new Map<string, ActiveMutation>();
  private readonly now: () => number;
  private readonly onStateChange: (snapshot: ChatMessageMutationSnapshot) => void;
  private readonly onTerminal: (event: ChatMessageMutationTerminalEvent) => void;
  private readonly publish: (command: ChatMessageMutationPublishCommand) => void;
  private readonly queue: string[] = [];
  private readonly random: () => number;
  private readonly scheduleTimer: (callback: () => void, delayMs: number) => MutationTimerHandle;

  constructor({
    admissionRetryPolicy = DEFAULT_CHAT_MESSAGE_ADMISSION_RETRY_POLICY,
    cancelTimer = (handle) => globalThis.clearTimeout(handle),
    isContextCurrent = () => true,
    limits = DEFAULT_LIMITS,
    maxPendingMutations = 100,
    now = Date.now,
    onStateChange = () => {},
    onTerminal = () => {},
    publish,
    random = Math.random,
    scheduleTimer = (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  }: ChatMessageMutationSchedulerOptions) {
    assertLimits(limits);
    assertPositiveInteger(maxPendingMutations, "maxPendingMutations");
    this.admissionRetryPolicy = admissionRetryPolicy;
    this.cancelTimer = cancelTimer;
    this.isContextCurrent = isContextCurrent;
    this.limits = limits;
    this.maxPendingMutations = maxPendingMutations;
    this.now = now;
    this.onStateChange = onStateChange;
    this.onTerminal = onTerminal;
    this.publish = publish;
    this.random = random;
    this.scheduleTimer = scheduleTimer;
  }

  start(input: StartChatMessageMutationInput): ChatMessageMutationSnapshot {
    if (this.disposed) {
      throw new Error("폐기된 메시지 mutation scheduler는 다시 사용할 수 없습니다.");
    }

    const roomId = roomIdSchema.parse(input.roomId);
    const request = Object.freeze(
      input.commandType === "EDIT_MESSAGE"
        ? chatMessageEditRequestSchema.parse(input.request)
        : chatMessageDeleteRequestSchema.parse(input.request),
    );
    const ownerId = assertOwnerId(input.ownerId);
    const generation = assertNonnegativeInteger(input.generation, "generation");
    const enqueuedAt = this.readNow();

    if (this.mutations.has(request.clientMutationId)) {
      throw new Error(`clientMutationId ${request.clientMutationId}는 이미 처리 중입니다.`);
    }

    if (this.mutations.size >= this.maxPendingMutations) {
      throw new Error(
        `메시지 수정·삭제 대기열은 최대 ${this.maxPendingMutations}개까지 보관할 수 있습니다.`,
      );
    }

    const mutation: ActiveMutation = {
      attempt: 0,
      commandType: input.commandType,
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

    this.mutations.set(request.clientMutationId, mutation);
    this.queue.push(request.clientMutationId);
    this.emitStateChange(mutation);
    this.pump();
    return createSnapshot(mutation);
  }

  handleCommandResult(result: ChatMessageMutationCommandResult): boolean {
    const mutation = this.mutations.get(result.clientMutationId);

    if (!mutation || mutation.status !== "sending" || mutation.commandType !== result.commandType) {
      return false;
    }

    this.clearTimer(mutation);

    if (isMutationSuccessResult(result)) {
      this.finish(mutation, {
        kind: "completed",
        result,
        snapshot: createSnapshot(mutation),
      });
      return true;
    }

    if (isMutationFailureResult(result) && result.retryable) {
      this.scheduleRetry(mutation, result);
      return true;
    }

    this.finish(mutation, {
      kind: "failed",
      reason: result.status === "REJECTED" ? "COMMAND_REJECTED" : "COMMAND_FAILED",
      result: isMutationFailureResult(result) ? result : undefined,
      snapshot: createSnapshot(mutation),
    });
    return true;
  }

  cancel(clientMutationId: string, reason: string): boolean {
    const mutation = this.mutations.get(clientMutationId);

    if (!mutation) {
      return false;
    }

    this.finish(mutation, {
      kind: "cancelled",
      reason: assertReason(reason),
      snapshot: createSnapshot(mutation),
    });
    return true;
  }

  cancelMatching(
    predicate: (snapshot: ChatMessageMutationSnapshot) => boolean,
    reason: string,
  ): number {
    const cancellationReason = assertReason(reason);
    const matches = [...this.mutations.values()].filter((mutation) =>
      predicate(createSnapshot(mutation)),
    );
    matches.forEach((mutation) => {
      this.finish(mutation, {
        kind: "cancelled",
        reason: cancellationReason,
        snapshot: createSnapshot(mutation),
      });
    });
    return matches.length;
  }

  cancelAll(reason: string): number {
    return this.cancelMatching(() => true, reason);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.cancelAll("SCHEDULER_DISPOSED");
    this.disposed = true;
  }

  private pump(): void {
    if (this.disposed || this.activeClientMutationId !== null) {
      return;
    }

    while (this.queue.length > 0) {
      const clientMutationId = this.queue.shift()!;
      const mutation = this.mutations.get(clientMutationId);

      if (!mutation || mutation.status !== "queued") {
        continue;
      }

      this.activeClientMutationId = clientMutationId;

      if (!this.validateContext(mutation)) {
        return;
      }

      mutation.attempt = 1;
      mutation.firstSentAt = this.readNow();
      mutation.status = "sending";
      this.emitStateChange(mutation);
      this.publishAttempt(mutation);
      return;
    }
  }

  private publishAttempt(mutation: ActiveMutation): void {
    try {
      this.publish(
        mutation.commandType === "EDIT_MESSAGE"
          ? {
              commandType: mutation.commandType,
              request: mutation.request as ChatMessageEditRequest,
              roomId: mutation.roomId,
            }
          : {
              commandType: mutation.commandType,
              request: mutation.request as ChatMessageDeleteRequest,
              roomId: mutation.roomId,
            },
      );
    } catch (cause) {
      this.scheduleRetryAfterLocalFailure(mutation, cause);
      return;
    }

    mutation.timerHandle = this.scheduleTimer(
      () => this.handleCommandResultTimeout(mutation.request.clientMutationId),
      this.limits.commandResultTimeoutMs,
    );
  }

  private handleCommandResultTimeout(clientMutationId: string): void {
    const mutation = this.mutations.get(clientMutationId);

    if (!mutation || mutation.status !== "sending") {
      return;
    }

    mutation.timerHandle = null;
    this.scheduleRetryAfterLocalFailure(mutation);
  }

  private scheduleRetryAfterLocalFailure(mutation: ActiveMutation, cause?: unknown): void {
    if (mutation.attempt >= this.limits.maxAttempts) {
      this.finish(mutation, {
        cause,
        kind: "failed",
        reason: cause ? "PUBLISH_FAILED" : "COMMAND_RESULT_TIMEOUT",
        snapshot: createSnapshot(mutation),
      });
      return;
    }

    this.scheduleRetry(mutation, undefined, cause);
  }

  private scheduleRetry(
    mutation: ActiveMutation,
    result?: ChatMessageMutationFailureResult,
    cause?: unknown,
  ): void {
    if (mutation.attempt >= this.limits.maxAttempts) {
      this.finish(mutation, {
        cause,
        kind: "failed",
        reason: "MAX_ATTEMPTS_REACHED",
        result,
        snapshot: createSnapshot(mutation),
      });
      return;
    }

    const now = this.readNow();
    const delayMs = calculateChatMessageAdmissionRetryDelay({
      policy: this.admissionRetryPolicy,
      previousDelayMs: mutation.previousDelayMs,
      randomFraction: this.random(),
      signal: {
        code: "SERVER_BUSY",
        retryAfterMs: result?.retryAfterMs ?? null,
      },
    });
    const scheduledAt = safeAdd(now, delayMs, "메시지 mutation 재시도 예정 시각");
    const firstSentAt = mutation.firstSentAt;

    if (firstSentAt === null || scheduledAt - firstSentAt >= this.limits.maxElapsedMs) {
      this.finish(mutation, {
        cause,
        kind: "failed",
        reason: "MAX_ELAPSED_TIME_REACHED",
        result,
        snapshot: createSnapshot(mutation),
      });
      return;
    }

    mutation.previousDelayMs = delayMs;
    mutation.scheduledAt = scheduledAt;
    mutation.status = "retry-waiting";
    this.emitStateChange(mutation);
    mutation.timerHandle = this.scheduleTimer(
      () => this.retryMutation(mutation.request.clientMutationId),
      delayMs,
    );
  }

  private retryMutation(clientMutationId: string): void {
    const mutation = this.mutations.get(clientMutationId);

    if (!mutation || mutation.status !== "retry-waiting") {
      return;
    }

    mutation.timerHandle = null;

    if (!this.validateContext(mutation)) {
      return;
    }

    mutation.attempt += 1;
    mutation.scheduledAt = null;
    mutation.status = "sending";
    this.emitStateChange(mutation);
    this.publishAttempt(mutation);
  }

  private validateContext(mutation: ActiveMutation): boolean {
    const snapshot = createSnapshot(mutation);
    let current: boolean;

    try {
      current = this.isContextCurrent(snapshot);
    } catch (cause) {
      this.finish(mutation, {
        cause,
        kind: "failed",
        reason: "CONTEXT_VALIDATION_FAILED",
        snapshot,
      });
      return false;
    }

    if (!current) {
      this.finish(mutation, {
        kind: "cancelled",
        reason: "MUTATION_CONTEXT_STALE",
        snapshot,
      });
      return false;
    }

    return true;
  }

  private finish(mutation: ActiveMutation, event: ChatMessageMutationTerminalEvent): void {
    const clientMutationId = mutation.request.clientMutationId;

    if (this.mutations.get(clientMutationId) !== mutation) {
      return;
    }

    this.clearTimer(mutation);
    this.mutations.delete(clientMutationId);
    const queueIndex = this.queue.indexOf(clientMutationId);

    if (queueIndex >= 0) {
      this.queue.splice(queueIndex, 1);
    }

    if (this.activeClientMutationId === clientMutationId) {
      this.activeClientMutationId = null;
    }

    this.onTerminal(event);
    this.pump();
  }

  private clearTimer(mutation: ActiveMutation): void {
    if (mutation.timerHandle === null) {
      return;
    }

    this.cancelTimer(mutation.timerHandle);
    mutation.timerHandle = null;
  }

  private emitStateChange(mutation: ActiveMutation): void {
    this.onStateChange(createSnapshot(mutation));
  }

  private readNow(): number {
    return assertNonnegativeInteger(this.now(), "현재 시각");
  }
}

export function createChatMessageMutationStateLifecycleEvent(
  snapshot: ChatMessageMutationSnapshot,
): ChatMessageMutationLifecycleEvent {
  return {
    attempt: snapshot.attempt,
    clientMutationId: snapshot.request.clientMutationId,
    commandType: snapshot.commandType,
    generation: snapshot.generation,
    messageId: snapshot.request.messageId,
    reason: null,
    retryAt: snapshot.scheduledAt,
    roomId: snapshot.roomId,
    status: snapshot.status,
  };
}

export function createChatMessageMutationTerminalLifecycleEvent(
  event: ChatMessageMutationTerminalEvent,
): ChatMessageMutationLifecycleEvent {
  return {
    attempt: event.snapshot.attempt,
    clientMutationId: event.snapshot.request.clientMutationId,
    commandType: event.snapshot.commandType,
    generation: event.snapshot.generation,
    messageId: event.snapshot.request.messageId,
    reason: event.kind === "completed" ? null : event.reason,
    retryAt: null,
    roomId: event.snapshot.roomId,
    status:
      event.kind === "completed" ? "completed" : event.kind === "failed" ? "failed" : "cancelled",
  };
}

export function isChatMessageMutationLifecycleEvent(
  value: unknown,
): value is ChatMessageMutationLifecycleEvent {
  if (!value || typeof value !== "object") {
    return false;
  }

  const event = value as Partial<ChatMessageMutationLifecycleEvent>;
  return (
    typeof event.attempt === "number" &&
    typeof event.clientMutationId === "string" &&
    (event.commandType === "EDIT_MESSAGE" || event.commandType === "DELETE_MESSAGE") &&
    typeof event.generation === "number" &&
    typeof event.messageId === "string" &&
    (event.reason === null || typeof event.reason === "string") &&
    (event.retryAt === null || typeof event.retryAt === "number") &&
    typeof event.roomId === "string" &&
    (event.status === "queued" ||
      event.status === "sending" ||
      event.status === "retry-waiting" ||
      event.status === "completed" ||
      event.status === "failed" ||
      event.status === "cancelled")
  );
}

export function getChatMessageMutationFailureMessage(
  event: Extract<ChatMessageMutationTerminalEvent, { kind: "failed" }>,
): string {
  if (event.result?.code) {
    return event.result.code;
  }

  if (event.cause instanceof Error && event.cause.message.trim()) {
    return event.cause.message;
  }

  return event.reason === "COMMAND_RESULT_TIMEOUT"
    ? "메시지 수정·삭제 결과를 확인하지 못했습니다."
    : "메시지 수정·삭제 요청을 완료하지 못했습니다.";
}

function createSnapshot(mutation: ActiveMutation): ChatMessageMutationSnapshot {
  return Object.freeze({
    attempt: mutation.attempt,
    commandType: mutation.commandType,
    enqueuedAt: mutation.enqueuedAt,
    firstSentAt: mutation.firstSentAt,
    generation: mutation.generation,
    ownerId: mutation.ownerId,
    previousDelayMs: mutation.previousDelayMs,
    request: mutation.request,
    roomId: mutation.roomId,
    scheduledAt: mutation.scheduledAt,
    status: mutation.status,
  });
}

function assertOwnerId(value: string): string {
  if (!value.trim()) {
    throw new Error("ownerId는 비어 있지 않아야 합니다.");
  }
  return value;
}

function assertReason(value: string): string {
  if (!value.trim()) {
    throw new Error("mutation 취소 사유는 비어 있지 않아야 합니다.");
  }
  return value;
}

function assertLimits(limits: ChatMessageMutationLimits): void {
  assertPositiveInteger(limits.commandResultTimeoutMs, "commandResultTimeoutMs");
  assertPositiveInteger(limits.maxAttempts, "maxAttempts");
  assertPositiveInteger(limits.maxElapsedMs, "maxElapsedMs");
}

function isMutationSuccessResult(
  result: ChatMessageMutationCommandResult,
): result is ChatMessageMutationSuccessResult {
  return result.code === null;
}

function isMutationFailureResult(
  result: ChatMessageMutationCommandResult,
): result is ChatMessageMutationFailureResult {
  return result.code !== null;
}

function assertPositiveInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${field}는 1 이상의 안전한 정수여야 합니다.`);
  }
  return value;
}

function assertNonnegativeInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${field}는 0 이상의 안전한 정수여야 합니다.`);
  }
  return value;
}

function safeAdd(left: number, right: number, field: string): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    throw new RangeError(`${field}이 안전한 정수 범위를 벗어났습니다.`);
  }
  return result;
}
