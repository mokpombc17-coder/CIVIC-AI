import type { ChatMessageCommandResult } from "./chat-stomp-contracts";

export type ChatMessageAdmissionRetrySignal =
  | Readonly<{
      code: "USER_RATE_LIMITED";
      retryAfterMs: number;
    }>
  | Readonly<{
      code: "SERVER_BUSY";
      retryAfterMs: number | null;
    }>;

export type ChatMessageAdmissionRetryPolicy = Readonly<{
  fallbackBaseDelayMs: number;
  fallbackGrowthFactor: number;
  fallbackMaxDelayMs: number;
  serverRetryJitterWindowMs: number;
}>;

export const DEFAULT_CHAT_MESSAGE_ADMISSION_RETRY_POLICY: ChatMessageAdmissionRetryPolicy =
  Object.freeze({
    fallbackBaseDelayMs: 500,
    fallbackGrowthFactor: 3,
    fallbackMaxDelayMs: 30_000,
    serverRetryJitterWindowMs: 1_000,
  });

type CalculateChatMessageAdmissionRetryDelayOptions = Readonly<{
  policy?: ChatMessageAdmissionRetryPolicy;
  previousDelayMs?: number | null;
  randomFraction: number;
  signal: ChatMessageAdmissionRetrySignal;
}>;

export function selectChatMessageAdmissionRetrySignal(
  result: ChatMessageCommandResult,
): ChatMessageAdmissionRetrySignal | null {
  if (result.status !== "REJECTED" || !result.retryable) {
    return null;
  }

  if (result.code === "USER_RATE_LIMITED") {
    return result.retryAfterMs === null
      ? null
      : {
          code: result.code,
          retryAfterMs: result.retryAfterMs,
        };
  }

  if (result.code === "SERVER_BUSY") {
    return {
      code: result.code,
      retryAfterMs: result.retryAfterMs,
    };
  }

  return null;
}

export function calculateChatMessageAdmissionRetryDelay({
  policy = DEFAULT_CHAT_MESSAGE_ADMISSION_RETRY_POLICY,
  previousDelayMs,
  randomFraction,
  signal,
}: CalculateChatMessageAdmissionRetryDelayOptions): number {
  assertPolicy(policy);
  assertRandomFraction(randomFraction);

  if (signal.retryAfterMs !== null) {
    assertDelay(signal.retryAfterMs, "retryAfterMs");
    const jitterMs = randomInteger(0, policy.serverRetryJitterWindowMs, randomFraction);
    return safeAdd(signal.retryAfterMs, jitterMs);
  }

  if (previousDelayMs !== undefined && previousDelayMs !== null) {
    assertDelay(previousDelayMs, "previousDelayMs");
  }

  const previousDelay = previousDelayMs ?? policy.fallbackBaseDelayMs;
  const grownDelay = Math.floor(previousDelay * policy.fallbackGrowthFactor);
  const maximumDelay = Math.min(
    policy.fallbackMaxDelayMs,
    Math.max(policy.fallbackBaseDelayMs, grownDelay),
  );

  return randomInteger(policy.fallbackBaseDelayMs, maximumDelay, randomFraction);
}

function assertPolicy(policy: ChatMessageAdmissionRetryPolicy): void {
  assertDelay(policy.fallbackBaseDelayMs, "fallbackBaseDelayMs");
  assertDelay(policy.fallbackMaxDelayMs, "fallbackMaxDelayMs");
  assertDelay(policy.serverRetryJitterWindowMs, "serverRetryJitterWindowMs");

  if (policy.fallbackBaseDelayMs < 1) {
    throw new RangeError("fallbackBaseDelayMs는 1ms 이상이어야 합니다.");
  }

  if (policy.fallbackMaxDelayMs < policy.fallbackBaseDelayMs) {
    throw new RangeError("fallbackMaxDelayMs는 fallbackBaseDelayMs 이상이어야 합니다.");
  }

  if (!Number.isFinite(policy.fallbackGrowthFactor) || policy.fallbackGrowthFactor <= 1) {
    throw new RangeError("fallbackGrowthFactor는 1보다 큰 유한한 수여야 합니다.");
  }
}

function assertRandomFraction(randomFraction: number): void {
  if (!Number.isFinite(randomFraction) || randomFraction < 0 || randomFraction >= 1) {
    throw new RangeError("randomFraction은 0 이상 1 미만이어야 합니다.");
  }
}

function assertDelay(delayMs: number, field: string): void {
  if (!Number.isSafeInteger(delayMs) || delayMs < 0) {
    throw new RangeError(`${field}는 0 이상의 안전한 정수여야 합니다.`);
  }
}

function randomInteger(minimum: number, maximum: number, randomFraction: number): number {
  const range = maximum - minimum + 1;
  return minimum + Math.floor(randomFraction * range);
}

function safeAdd(left: number, right: number): number {
  const result = left + right;

  if (!Number.isSafeInteger(result)) {
    throw new RangeError("계산된 메시지 재전송 대기시간이 안전한 정수 범위를 벗어났습니다.");
  }

  return result;
}
