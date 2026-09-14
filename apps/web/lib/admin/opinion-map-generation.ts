import { formatAdminProblem, readAdminProblem } from "@/lib/admin/domain-contracts";

export const OPINION_MAP_UNAVAILABLE_LIMIT = 20;

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
    options: parsedOptions,
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

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
