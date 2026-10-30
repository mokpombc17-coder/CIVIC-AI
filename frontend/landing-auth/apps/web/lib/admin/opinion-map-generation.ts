import { formatAdminProblem, readAdminProblem } from "@/lib/admin/domain-contracts";

export const OPINION_MAP_UNAVAILABLE_LIMIT = 20;
export const OPINION_MAP_RUN_POLL_INTERVAL_MS = 5_000;
export const OPINION_MAP_RUN_POLL_TIMEOUT_MS = 10 * 60 * 1_000;

export type OpinionMapUnavailableItem = Readonly<{
  taskId: string;
  taskTitle: string;
  resultVersion: number;
  attemptCount: number;
  lastErrorCode: string;
  failedAt: string;
  canRetry: boolean;
}>;

export type OpinionMapUnavailablePage = Readonly<{
  items: readonly OpinionMapUnavailableItem[];
  nextCursor: string | null;
}>;

export type OpinionMapRetryResult = Readonly<{
  taskId: string;
  resultVersion: number;
  status: string;
  attemptCount: number;
  action: "RETRIED" | "UNCHANGED" | "CREATED";
  updatedAt: string;
}>;

export type OpinionMapGenerationStatus =
  | "NOT_ELIGIBLE"
  | "NOT_CREATED"
  | "PENDING"
  | "PROCESSING"
  | "RETRY_WAIT"
  | "AVAILABLE"
  | "UNAVAILABLE";

export type OpinionMapRunStatus = Extract<
  OpinionMapGenerationStatus,
  "PENDING" | "PROCESSING" | "RETRY_WAIT" | "AVAILABLE" | "UNAVAILABLE"
>;

export type OpinionMapRunTrigger = "TASK_CLOSED" | "ADMIN_RETRY" | "ADMIN_REGENERATE";
export type OpinionMapAttemptStatus = "STARTED" | "SUCCEEDED" | "FAILED";

type OpinionMapAttemptBase = Readonly<{
  attemptId: string;
  attemptNumber: number;
  provider: string;
  requestedModel: string;
  responseModel: string | null;
  providerGenerationId: string | null;
  providerRequestId: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  cachedTokens: number | null;
  reasoningTokens: number | null;
  cost: number | null;
  currency: string | null;
  finishReason: string | null;
  httpStatus: number | null;
  startedAt: string;
}>;

export type OpinionMapGenerationAttempt = OpinionMapAttemptBase &
  (
    | Readonly<{
        status: "STARTED";
        errorCode: null;
        retryable: null;
        completedAt: null;
        latencyMs: null;
      }>
    | Readonly<{
        status: "SUCCEEDED";
        errorCode: null;
        retryable: null;
        completedAt: string;
        latencyMs: number;
      }>
    | Readonly<{
        status: "FAILED";
        errorCode: string;
        retryable: boolean;
        completedAt: string;
        latencyMs: number;
      }>
  );

type OpinionMapRunBase = Readonly<{
  runId: string;
  resultVersion: number;
  runNumber: number;
  attemptCount: number;
  requestedAt: string;
  lastErrorCode: string | null;
  attempts: readonly OpinionMapGenerationAttempt[];
}>;

type OpinionMapRunRequester =
  | Readonly<{ trigger: "TASK_CLOSED"; requestedBy: null }>
  | Readonly<{ trigger: "ADMIN_RETRY" | "ADMIN_REGENERATE"; requestedBy: string }>;

type OpinionMapRunState =
  | Readonly<{
      status: "PENDING" | "PROCESSING" | "RETRY_WAIT";
      completedAt: null;
    }>
  | Readonly<{
      status: "AVAILABLE" | "UNAVAILABLE";
      completedAt: string;
    }>;

export type OpinionMapGenerationRun = OpinionMapRunBase &
  OpinionMapRunRequester &
  OpinionMapRunState;

export type OpinionMapGenerationRuns = Readonly<{
  runs: readonly OpinionMapGenerationRun[];
}>;

export type OpinionMapRegenerationResult = Readonly<{
  taskId: string;
  resultVersion: number;
  runId: string;
  runNumber: number;
  status: OpinionMapRunStatus;
  attemptCount: number;
  created: boolean;
  requestedAt: string;
  updatedAt: string;
}>;

export type OpinionMapAreaStatus = "AVAILABLE" | "NO_RESPONSES" | "INSUFFICIENT_REASON";

export type OpinionMapArea = Readonly<{
  status: OpinionMapAreaStatus;
  body: string | null;
}>;

export type OpinionMapGenerationOption = Readonly<{
  optionId: string;
  displayOrder: number;
  content: string;
  responseCount: number | null;
  sameChoice: OpinionMapArea | null;
  otherChoices: OpinionMapArea | null;
}>;

export type OpinionMapGeneration = Readonly<{
  taskId: string;
  resultVersion: number | null;
  status: OpinionMapGenerationStatus;
  attemptCount: number;
  lastErrorCode: string | null;
  nextAttemptAt: string | null;
  processingStartedAt: string | null;
  completedAt: string | null;
  updatedAt: string | null;
  canGenerate: boolean;
  canRetry: boolean;
  canRegenerate: boolean;
  options: readonly OpinionMapGenerationOption[];
}>;

export function opinionMapUnavailablePath(cursor?: string): string {
  const query = new URLSearchParams({ limit: String(OPINION_MAP_UNAVAILABLE_LIMIT) });
  if (cursor) query.set("cursor", cursor);
  return `/api/v1/admin/opinion-map-generations/unavailable?${query}`;
}

export function opinionMapRetryPath(taskId: string): string {
  return `/api/v1/admin/tasks/${encodeURIComponent(taskId)}/opinion-map-generation`;
}

export const opinionMapGenerationPath = opinionMapRetryPath;

export function opinionMapRegenerationPath(taskId: string): string {
  return `${opinionMapGenerationPath(taskId)}/regenerations`;
}

export function opinionMapRunsPath(taskId: string): string {
  return `${opinionMapGenerationPath(taskId)}/runs`;
}

export function readOpinionMapUnavailablePage(value: unknown): OpinionMapUnavailablePage | null {
  const page = object(value);
  if (!page || !Array.isArray(page.items)) return null;
  if (page.nextCursor !== null && typeof page.nextCursor !== "string") return null;

  const items = page.items.map(readOpinionMapUnavailableItem);
  if (items.some((item) => !item)) return null;
  return {
    items: items as readonly OpinionMapUnavailableItem[],
    nextCursor: page.nextCursor,
  };
}

export function readOpinionMapRetryResult(value: unknown): OpinionMapRetryResult | null {
  const result = object(value);
  const taskId = result && nonEmptyString(result.taskId);
  const status = result && nonEmptyString(result.status);
  const action = result && nonEmptyString(result.action);
  const updatedAt = result && timestamp(result.updatedAt);
  if (
    !result ||
    !taskId ||
    !positiveInteger(result.resultVersion) ||
    !status ||
    !nonNegativeInteger(result.attemptCount) ||
    !action ||
    !["RETRIED", "UNCHANGED", "CREATED"].includes(action) ||
    !updatedAt
  ) {
    return null;
  }
  return {
    taskId,
    resultVersion: result.resultVersion as number,
    status,
    attemptCount: result.attemptCount as number,
    action: action as OpinionMapRetryResult["action"],
    updatedAt,
  };
}

export function readOpinionMapGeneration(value: unknown): OpinionMapGeneration | null {
  const generation = object(value);
  const taskId = generation && nonEmptyString(generation.taskId);
  const status = generation && opinionMapGenerationStatus(generation.status);
  if (
    !generation ||
    !taskId ||
    !status ||
    !nullablePositiveInteger(generation.resultVersion) ||
    !nonNegativeInteger(generation.attemptCount) ||
    !nullableNonEmptyString(generation.lastErrorCode) ||
    !nullableTimestamp(generation.nextAttemptAt) ||
    !nullableTimestamp(generation.processingStartedAt) ||
    !nullableTimestamp(generation.completedAt) ||
    !nullableTimestamp(generation.updatedAt) ||
    typeof generation.canGenerate !== "boolean" ||
    typeof generation.canRetry !== "boolean" ||
    typeof generation.canRegenerate !== "boolean" ||
    !Array.isArray(generation.options)
  ) {
    return null;
  }

  const options = generation.options.map(readOpinionMapGenerationOption);
  if (options.some((option) => !option)) return null;
  const parsedOptions = options as readonly OpinionMapGenerationOption[];
  if (
    parsedOptions.some(
      (option, index) =>
        (index > 0 && option.displayOrder <= parsedOptions[index - 1]!.displayOrder) ||
        parsedOptions.findIndex((candidate) => candidate.optionId === option.optionId) !== index,
    )
  ) {
    return null;
  }

  if (
    status === "AVAILABLE"
      ? generation.resultVersion === null ||
        parsedOptions.some(
          (option) => option.responseCount === null || !option.sameChoice || !option.otherChoices,
        )
      : parsedOptions.some((option) => option.sameChoice !== null || option.otherChoices !== null)
  ) {
    return null;
  }
  if (
    status === "NOT_CREATED" &&
    (generation.resultVersion === null
      ? parsedOptions.some((option) => option.responseCount !== null)
      : parsedOptions.some((option) => option.responseCount === null))
  ) {
    return null;
  }

  return {
    taskId,
    resultVersion: generation.resultVersion as number | null,
    status,
    attemptCount: generation.attemptCount as number,
    lastErrorCode: generation.lastErrorCode as string | null,
    nextAttemptAt: generation.nextAttemptAt as string | null,
    processingStartedAt: generation.processingStartedAt as string | null,
    completedAt: generation.completedAt as string | null,
    updatedAt: generation.updatedAt as string | null,
    canGenerate: generation.canGenerate,
    canRetry: generation.canRetry,
    canRegenerate: generation.canRegenerate,
    options: parsedOptions,
  };
}

export function readOpinionMapGenerationRuns(value: unknown): OpinionMapGenerationRuns | null {
  const result = object(value);
  if (!result || !Array.isArray(result.runs)) return null;

  const runs = result.runs.map(readOpinionMapGenerationRun);
  if (runs.some((run) => !run)) return null;
  const parsedRuns = runs as readonly OpinionMapGenerationRun[];
  if (
    parsedRuns.some(
      (run, index) =>
        parsedRuns.findIndex((candidate) => candidate.runId === run.runId) !== index ||
        (index > 0 && !isRunBefore(parsedRuns[index - 1]!, run)),
    )
  ) {
    return null;
  }
  return { runs: parsedRuns };
}

export function readOpinionMapRegenerationResult(
  value: unknown,
): OpinionMapRegenerationResult | null {
  const result = object(value);
  const taskId = result && nonEmptyString(result.taskId);
  const runId = result && nonEmptyString(result.runId);
  const status = result && opinionMapRunStatus(result.status);
  const requestedAt = result && timestamp(result.requestedAt);
  const updatedAt = result && timestamp(result.updatedAt);
  if (
    !result ||
    !taskId ||
    !positiveInteger(result.resultVersion) ||
    !runId ||
    !positiveInteger(result.runNumber) ||
    !status ||
    !nonNegativeInteger(result.attemptCount) ||
    typeof result.created !== "boolean" ||
    !requestedAt ||
    !updatedAt
  ) {
    return null;
  }
  return {
    taskId,
    resultVersion: result.resultVersion as number,
    runId,
    runNumber: result.runNumber as number,
    status,
    attemptCount: result.attemptCount as number,
    created: result.created,
    requestedAt,
    updatedAt,
  };
}

export async function requestOpinionMapUnavailablePage(
  cursor?: string,
  request: typeof fetch = fetch,
): Promise<OpinionMapUnavailablePage> {
  const response = await request(opinionMapUnavailablePath(cursor), { cache: "no-store" });
  if (!response.ok) throw new Error(formatAdminProblem(await readAdminProblem(response)));
  const page = readOpinionMapUnavailablePage(await response.json());
  if (!page) throw new Error("정성 요약 실패 목록의 응답 형식을 확인하지 못했습니다.");
  return page;
}

export async function requestOpinionMapRetry(
  taskId: string,
  request: typeof fetch = fetch,
): Promise<OpinionMapRetryResult> {
  const response = await request(opinionMapRetryPath(taskId), { method: "POST" });
  if (!response.ok) throw new Error(formatAdminProblem(await readAdminProblem(response)));
  const result = readOpinionMapRetryResult(await response.json());
  if (!result) throw new Error("정성 요약 재시도 응답 형식을 확인하지 못했습니다.");
  return result;
}

export async function requestOpinionMapGeneration(
  taskId: string,
  request: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<OpinionMapGeneration> {
  const response = await request(opinionMapGenerationPath(taskId), {
    cache: "no-store",
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw new Error(formatAdminProblem(await readAdminProblem(response)));
  const generation = readOpinionMapGeneration(await response.json());
  if (!generation || generation.taskId !== taskId) {
    throw new Error("정성 요약 조회 응답 형식을 확인하지 못했습니다.");
  }
  return generation;
}

export async function requestOpinionMapGenerationRuns(
  taskId: string,
  request: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<OpinionMapGenerationRuns> {
  const response = await request(opinionMapRunsPath(taskId), {
    cache: "no-store",
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw new Error(formatAdminProblem(await readAdminProblem(response)));
  const result = readOpinionMapGenerationRuns(await response.json());
  if (!result) throw new Error("정성 요약 생성 이력 응답 형식을 확인하지 못했습니다.");
  return result;
}

export async function requestOpinionMapRegeneration(
  taskId: string,
  idempotencyKey: string,
  request: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<OpinionMapRegenerationResult> {
  const response = await request(opinionMapRegenerationPath(taskId), {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw new Error(formatAdminProblem(await readAdminProblem(response)));
  const result = readOpinionMapRegenerationResult(await response.json());
  if (!result || result.taskId !== taskId) {
    throw new Error("정성 요약 재생성 응답 형식을 확인하지 못했습니다.");
  }
  return result;
}

export function isOpinionMapRunActive(run: OpinionMapGenerationRun): boolean {
  return ["PENDING", "PROCESSING", "RETRY_WAIT"].includes(run.status);
}

export function findActiveOpinionMapRun(
  runs: readonly OpinionMapGenerationRun[],
): OpinionMapGenerationRun | null {
  return runs.find(isOpinionMapRunActive) ?? null;
}

export function hasOpinionMapRunPollingTimedOut(
  run: Pick<OpinionMapGenerationRun, "requestedAt">,
  now = Date.now(),
): boolean {
  return Math.max(0, now - Date.parse(run.requestedAt)) >= OPINION_MAP_RUN_POLL_TIMEOUT_MS;
}

export function mergeOpinionMapUnavailableItems(
  current: readonly OpinionMapUnavailableItem[],
  incoming: readonly OpinionMapUnavailableItem[],
): readonly OpinionMapUnavailableItem[] {
  const items = new Map(current.map((item) => [item.taskId, item]));
  for (const item of incoming) items.set(item.taskId, item);
  return [...items.values()];
}

export function opinionMapFailureMessage(code: string): string {
  return (
    {
      OPINION_MAP_OPENROUTER_TIMEOUT: "AI 응답 시간이 초과되었습니다.",
    }[code] ?? "정성 요약을 생성하지 못했습니다."
  );
}

function readOpinionMapUnavailableItem(value: unknown): OpinionMapUnavailableItem | null {
  const item = object(value);
  const taskId = item && nonEmptyString(item.taskId);
  const taskTitle = item && nonEmptyString(item.taskTitle);
  const lastErrorCode = item && nonEmptyString(item.lastErrorCode);
  const failedAt = item && timestamp(item.failedAt);
  if (
    !item ||
    !taskId ||
    !taskTitle ||
    !positiveInteger(item.resultVersion) ||
    !nonNegativeInteger(item.attemptCount) ||
    !lastErrorCode ||
    !failedAt ||
    typeof item.canRetry !== "boolean"
  ) {
    return null;
  }
  return {
    taskId,
    taskTitle,
    resultVersion: item.resultVersion as number,
    attemptCount: item.attemptCount as number,
    lastErrorCode,
    failedAt,
    canRetry: item.canRetry,
  };
}

function readOpinionMapGenerationRun(value: unknown): OpinionMapGenerationRun | null {
  const run = object(value);
  const runId = run && nonEmptyString(run.runId);
  const trigger = run && opinionMapRunTrigger(run.trigger);
  const status = run && opinionMapRunStatus(run.status);
  const requestedAt = run && timestamp(run.requestedAt);
  if (
    !run ||
    !runId ||
    !positiveInteger(run.resultVersion) ||
    !positiveInteger(run.runNumber) ||
    !trigger ||
    !status ||
    !nonNegativeInteger(run.attemptCount) ||
    !requestedAt ||
    !nullableTimestamp(run.completedAt) ||
    !nullableNonEmptyString(run.lastErrorCode) ||
    !Array.isArray(run.attempts)
  ) {
    return null;
  }
  if (
    (trigger === "TASK_CLOSED" && run.requestedBy !== null) ||
    (trigger !== "TASK_CLOSED" && !nonEmptyString(run.requestedBy)) ||
    (isActiveOpinionMapRunStatus(status) && run.completedAt !== null) ||
    (!isActiveOpinionMapRunStatus(status) && !timestamp(run.completedAt))
  ) {
    return null;
  }

  const attempts = run.attempts.map(readOpinionMapGenerationAttempt);
  if (attempts.some((attempt) => !attempt)) return null;
  const parsedAttempts = attempts as readonly OpinionMapGenerationAttempt[];
  if (
    parsedAttempts.some(
      (attempt, index) =>
        (index > 0 && attempt.attemptNumber <= parsedAttempts[index - 1]!.attemptNumber) ||
        parsedAttempts.findIndex((candidate) => candidate.attemptId === attempt.attemptId) !==
          index,
    )
  ) {
    return null;
  }

  const base: OpinionMapRunBase = {
    runId,
    resultVersion: run.resultVersion as number,
    runNumber: run.runNumber as number,
    attemptCount: run.attemptCount as number,
    requestedAt,
    lastErrorCode: run.lastErrorCode as string | null,
    attempts: parsedAttempts,
  };
  const requester: OpinionMapRunRequester =
    trigger === "TASK_CLOSED"
      ? { trigger, requestedBy: null }
      : { trigger, requestedBy: run.requestedBy as string };
  return isActiveOpinionMapRunStatus(status)
    ? { ...base, ...requester, status, completedAt: null }
    : { ...base, ...requester, status, completedAt: run.completedAt as string };
}

function readOpinionMapGenerationAttempt(value: unknown): OpinionMapGenerationAttempt | null {
  const attempt = object(value);
  const attemptId = attempt && nonEmptyString(attempt.attemptId);
  const status = attempt && opinionMapAttemptStatus(attempt.status);
  const provider = attempt && nonEmptyString(attempt.provider);
  const requestedModel = attempt && nonEmptyString(attempt.requestedModel);
  const startedAt = attempt && timestamp(attempt.startedAt);
  if (
    !attempt ||
    !attemptId ||
    !positiveInteger(attempt.attemptNumber) ||
    !status ||
    !provider ||
    !requestedModel ||
    !nullableNonEmptyString(attempt.responseModel) ||
    !nullableNonEmptyString(attempt.providerGenerationId) ||
    !nullableNonEmptyString(attempt.providerRequestId) ||
    !nullableNonNegativeInteger(attempt.promptTokens) ||
    !nullableNonNegativeInteger(attempt.completionTokens) ||
    !nullableNonNegativeInteger(attempt.totalTokens) ||
    !nullableNonNegativeInteger(attempt.cachedTokens) ||
    !nullableNonNegativeInteger(attempt.reasoningTokens) ||
    !nullableNonNegativeNumber(attempt.cost) ||
    !nullableNonEmptyString(attempt.currency) ||
    (attempt.cost === null) !== (attempt.currency === null) ||
    !nullableNonEmptyString(attempt.finishReason) ||
    !nullableHttpStatus(attempt.httpStatus) ||
    !startedAt ||
    !nullableTimestamp(attempt.completedAt) ||
    !nullableNonNegativeInteger(attempt.latencyMs)
  ) {
    return null;
  }

  const base: OpinionMapAttemptBase = {
    attemptId,
    attemptNumber: attempt.attemptNumber as number,
    provider,
    requestedModel,
    responseModel: attempt.responseModel as string | null,
    providerGenerationId: attempt.providerGenerationId as string | null,
    providerRequestId: attempt.providerRequestId as string | null,
    promptTokens: attempt.promptTokens as number | null,
    completionTokens: attempt.completionTokens as number | null,
    totalTokens: attempt.totalTokens as number | null,
    cachedTokens: attempt.cachedTokens as number | null,
    reasoningTokens: attempt.reasoningTokens as number | null,
    cost: attempt.cost as number | null,
    currency: attempt.currency as string | null,
    finishReason: attempt.finishReason as string | null,
    httpStatus: attempt.httpStatus as number | null,
    startedAt,
  };
  if (status === "STARTED") {
    return attempt.completedAt === null &&
      attempt.latencyMs === null &&
      attempt.errorCode === null &&
      attempt.retryable === null
      ? {
          ...base,
          status,
          completedAt: null,
          latencyMs: null,
          errorCode: null,
          retryable: null,
        }
      : null;
  }
  if (!timestamp(attempt.completedAt) || !nonNegativeInteger(attempt.latencyMs)) return null;
  if (status === "SUCCEEDED") {
    return attempt.errorCode === null && attempt.retryable === null
      ? {
          ...base,
          status,
          completedAt: attempt.completedAt as string,
          latencyMs: attempt.latencyMs as number,
          errorCode: null,
          retryable: null,
        }
      : null;
  }
  const errorCode = nonEmptyString(attempt.errorCode);
  return errorCode && typeof attempt.retryable === "boolean"
    ? {
        ...base,
        status,
        completedAt: attempt.completedAt as string,
        latencyMs: attempt.latencyMs as number,
        errorCode,
        retryable: attempt.retryable,
      }
    : null;
}

function isRunBefore(previous: OpinionMapGenerationRun, current: OpinionMapGenerationRun): boolean {
  return (
    previous.resultVersion > current.resultVersion ||
    (previous.resultVersion === current.resultVersion && previous.runNumber > current.runNumber)
  );
}

function readOpinionMapGenerationOption(value: unknown): OpinionMapGenerationOption | null {
  const option = object(value);
  const optionId = option && nonEmptyString(option.optionId);
  const content = option && nonEmptyString(option.content);
  if (
    !option ||
    !optionId ||
    !positiveInteger(option.displayOrder) ||
    !content ||
    !nullableNonNegativeInteger(option.responseCount)
  ) {
    return null;
  }
  const sameChoice = option.sameChoice === null ? null : readOpinionMapArea(option.sameChoice);
  const otherChoices =
    option.otherChoices === null ? null : readOpinionMapArea(option.otherChoices);
  if (
    (option.sameChoice !== null && !sameChoice) ||
    (option.otherChoices !== null && !otherChoices)
  ) {
    return null;
  }
  return {
    optionId,
    displayOrder: option.displayOrder as number,
    content,
    responseCount: option.responseCount as number | null,
    sameChoice,
    otherChoices,
  };
}

function readOpinionMapArea(value: unknown): OpinionMapArea | null {
  const area = object(value);
  const status = area && opinionMapAreaStatus(area.status);
  if (!area || !status) return null;
  if (status === "AVAILABLE") {
    const body = nonEmptyString(area.body);
    return body ? { status, body } : null;
  }
  return area.body === null ? { status, body: null } : null;
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function timestamp(value: unknown): string | null {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

function opinionMapGenerationStatus(value: unknown): OpinionMapGenerationStatus | null {
  return typeof value === "string" &&
    [
      "NOT_ELIGIBLE",
      "NOT_CREATED",
      "PENDING",
      "PROCESSING",
      "RETRY_WAIT",
      "AVAILABLE",
      "UNAVAILABLE",
    ].includes(value)
    ? (value as OpinionMapGenerationStatus)
    : null;
}

function opinionMapRunStatus(value: unknown): OpinionMapRunStatus | null {
  return typeof value === "string" &&
    ["PENDING", "PROCESSING", "RETRY_WAIT", "AVAILABLE", "UNAVAILABLE"].includes(value)
    ? (value as OpinionMapRunStatus)
    : null;
}

function isActiveOpinionMapRunStatus(
  status: OpinionMapRunStatus,
): status is "PENDING" | "PROCESSING" | "RETRY_WAIT" {
  return ["PENDING", "PROCESSING", "RETRY_WAIT"].includes(status);
}

function opinionMapRunTrigger(value: unknown): OpinionMapRunTrigger | null {
  return typeof value === "string" &&
    ["TASK_CLOSED", "ADMIN_RETRY", "ADMIN_REGENERATE"].includes(value)
    ? (value as OpinionMapRunTrigger)
    : null;
}

function opinionMapAttemptStatus(value: unknown): OpinionMapAttemptStatus | null {
  return typeof value === "string" && ["STARTED", "SUCCEEDED", "FAILED"].includes(value)
    ? (value as OpinionMapAttemptStatus)
    : null;
}

function opinionMapAreaStatus(value: unknown): OpinionMapAreaStatus | null {
  return typeof value === "string" &&
    ["AVAILABLE", "NO_RESPONSES", "INSUFFICIENT_REASON"].includes(value)
    ? (value as OpinionMapAreaStatus)
    : null;
}

function nullableNonEmptyString(value: unknown): value is string | null {
  return value === null || nonEmptyString(value) !== null;
}

function nullableTimestamp(value: unknown): value is string | null {
  return value === null || timestamp(value) !== null;
}

function nullablePositiveInteger(value: unknown): value is number | null {
  return value === null || positiveInteger(value);
}

function nullableNonNegativeInteger(value: unknown): value is number | null {
  return value === null || nonNegativeInteger(value);
}

function nullableNonNegativeNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

function nullableHttpStatus(value: unknown): value is number | null {
  return (
    value === null ||
    (Number.isInteger(value) && (value as number) >= 100 && (value as number) <= 599)
  );
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
