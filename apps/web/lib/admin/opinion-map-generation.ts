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

export function opinionMapUnavailablePath(cursor?: string): string {
  const query = new URLSearchParams({ limit: String(OPINION_MAP_UNAVAILABLE_LIMIT) });
  if (cursor) query.set("cursor", cursor);
  return `/api/v1/admin/opinion-map-generations/unavailable?${query}`;
}

export function opinionMapRetryPath(taskId: string): string {
  return `/api/v1/admin/tasks/${encodeURIComponent(taskId)}/opinion-map-generation`;
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

export async function requestOpinionMapUnavailablePage(
  cursor?: string,
  request: typeof fetch = fetch,
): Promise<OpinionMapUnavailablePage> {
  const response = await request(opinionMapUnavailablePath(cursor), { cache: "no-store" });
  if (!response.ok) throw new Error(formatAdminProblem(await readAdminProblem(response)));
  const page = readOpinionMapUnavailablePage(await response.json());
  if (!page) throw new Error("Opinion Map 실패 목록의 응답 형식을 확인하지 못했습니다.");
  return page;
}

export async function requestOpinionMapRetry(
  taskId: string,
  request: typeof fetch = fetch,
): Promise<OpinionMapRetryResult> {
  const response = await request(opinionMapRetryPath(taskId), { method: "POST" });
  if (!response.ok) throw new Error(formatAdminProblem(await readAdminProblem(response)));
  const result = readOpinionMapRetryResult(await response.json());
  if (!result) throw new Error("Opinion Map 재시도 응답 형식을 확인하지 못했습니다.");
  return result;
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
    }[code] ?? "Opinion Map을 생성하지 못했습니다."
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

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
