export type ProblemViolation = Readonly<{
  field: string;
  message: string;
}>;

export type AdminProblem = Readonly<{
  code: string;
  detail?: string;
  referencedRoomCount?: number;
  retryAfter?: string;
  status: number;
  traceId?: string;
  violations: readonly ProblemViolation[];
}>;

export type RoomCreationStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELED";

export type RoomCreationRequest = Readonly<{
  categoryIds: readonly string[];
  creationRequestId: string;
  description: string;
  joinPolicy: string;
  name: string;
  ownerMembershipId: string | null;
  ownerMembershipVersion: number | null;
  rejectionReason: string | null;
  replayed: boolean;
  requestedAt: string;
  requesterUserId: string;
  resolvedAt: string | null;
  roomId: string | null;
  roomVersion: number | null;
  status: RoomCreationStatus;
  visibility: string;
}>;

export type RoomCreationRequestPage = Readonly<{
  hasNext: boolean;
  items: readonly RoomCreationRequest[];
  nextCursor: string | null;
}>;

export type TaskStatus = "DRAFT" | "SCHEDULED" | "OPEN" | "CLOSED";
export type TaskClosureType = "EARLY_CLOSED" | "DEADLINE_REACHED" | "CANCELLED" | "MISSED_SCHEDULE";
export type TaskPreparationStatus = "PROCESSING" | "READY" | "FAILED" | "REJECTED";

export type TaskPreparationError = Readonly<{
  code: string;
  detail: string;
  retryable: boolean;
}>;

export type TaskPreparationView = Readonly<{
  attemptCount: number;
  contentFingerprint: string;
  lastError: TaskPreparationError | null;
  preparedAt: string | null;
  processingStartedAt: string | null;
  requestId: string;
  status: TaskPreparationStatus;
  updatedAt: string;
}>;

export type TaskCapabilities = Readonly<{
  canEditContent: boolean;
  canOpenNow: boolean;
  canSchedule: boolean;
  canStartPreparation: boolean;
}>;

export type TaskSchedule = Readonly<{
  closesAt: string;
  opensAt: string;
}>;

export type TaskOption = Readonly<{
  content: string;
  displayOrder: number;
  id: string;
}>;

export type TaskQuestion = Readonly<{
  content: string;
  description: string | null;
  id: string;
  options: readonly TaskOption[];
}>;

export type Task = Readonly<{
  closedAt: string | null;
  closureType: TaskClosureType | null;
  createdAt: string;
  description: string | null;
  id: string;
  openedAt: string | null;
  publishedAt: string | null;
  question: TaskQuestion | null;
  schedule: TaskSchedule | null;
  status: TaskStatus;
  title: string;
  updatedAt: string;
}>;

export type TaskSummary = Readonly<{
  closedAt: string | null;
  closureType: TaskClosureType | null;
  createdAt: string;
  openedAt: string | null;
  publishedAt: string | null;
  schedule: TaskSchedule | null;
  status: TaskStatus;
  taskId: string;
  title: string;
  updatedAt: string;
}>;

export type TaskLifecycleEvent = Readonly<{
  actorId: string | null;
  closureType: TaskClosureType | null;
  eventType: string;
  id: string;
  newSchedule: TaskSchedule | null;
  newStatus: TaskStatus | null;
  occurredAt: string;
  previousSchedule: TaskSchedule | null;
  previousStatus: TaskStatus | null;
  reason: string | null;
  trigger: string;
}>;

export type TaskDetail = Readonly<{
  capabilities: TaskCapabilities;
  lifecycleHistory: readonly TaskLifecycleEvent[];
  preparation: TaskPreparationView | null;
  task: Task;
}>;

export type TaskPreparationStartResponse = Readonly<{
  preparation: TaskPreparationView;
  replayed: boolean;
  taskId: string;
}>;

export type TaskResultSummary = Readonly<{
  options: readonly Readonly<{ content: string; count: number; key: string }>[];
  responseCount: number;
  resultVersion: number;
  schemaVersion: "task-result-summary/v1";
}>;

const roomStatuses = new Set<RoomCreationStatus>(["PENDING", "APPROVED", "REJECTED", "CANCELED"]);
const taskStatuses = new Set<TaskStatus>(["DRAFT", "SCHEDULED", "OPEN", "CLOSED"]);
const closureTypes = new Set<TaskClosureType>([
  "EARLY_CLOSED",
  "DEADLINE_REACHED",
  "CANCELLED",
  "MISSED_SCHEDULE",
]);
const taskPreparationStatuses = new Set<TaskPreparationStatus>([
  "PROCESSING",
  "READY",
  "FAILED",
  "REJECTED",
]);
const contentFingerprintPattern = /^sha256:[0-9a-f]{64}$/u;

export function readRoomCreationRequestPage(value: unknown): RoomCreationRequestPage | null {
  const record = object(value);
  if (!record || !Array.isArray(record.items) || typeof record.hasNext !== "boolean") return null;
  const items = record.items.map(readRoomCreationRequest);
  if (items.some((item) => item === null)) return null;
  const nextCursor = nullableString(record.nextCursor);
  if (record.nextCursor !== null && nextCursor === null) return null;
  if (record.hasNext && !nextCursor) return null;
  return { hasNext: record.hasNext, items: items as RoomCreationRequest[], nextCursor };
}

export function readRoomCreationRequest(value: unknown): RoomCreationRequest | null {
  const record = object(value);
  if (!record) return null;
  const status = string(record.status);
  const categoryIds = stringArray(record.categoryIds);
  if (
    !status ||
    !roomStatuses.has(status as RoomCreationStatus) ||
    !categoryIds ||
    typeof record.replayed !== "boolean"
  ) {
    return null;
  }
  const required = requiredStrings(record, [
    "creationRequestId",
    "requesterUserId",
    "name",
    "visibility",
    "joinPolicy",
    "requestedAt",
  ] as const);
  if (!required || typeof record.description !== "string") return null;
  return {
    categoryIds,
    creationRequestId: required.creationRequestId,
    description: record.description,
    joinPolicy: required.joinPolicy,
    ownerMembershipId: nullableString(record.ownerMembershipId),
    ownerMembershipVersion: nullableNonNegativeInteger(record.ownerMembershipVersion),
    name: required.name,
    rejectionReason: nullableString(record.rejectionReason),
    replayed: record.replayed,
    requestedAt: required.requestedAt,
    requesterUserId: required.requesterUserId,
    resolvedAt: nullableString(record.resolvedAt),
    roomId: nullableString(record.roomId),
    roomVersion: nullableNonNegativeInteger(record.roomVersion),
    status: status as RoomCreationStatus,
    visibility: required.visibility,
  };
}

export function readTaskSummaries(value: unknown): readonly TaskSummary[] | null {
  if (!Array.isArray(value)) return null;
  const items = value.map(readTaskSummary);
  return items.some((item) => item === null) ? null : (items as TaskSummary[]);
}

export function readTask(value: unknown): Task | null {
  const record = object(value);
  if (!record) return null;
  const id = string(record.id);
  const title = string(record.title);
  const status = readTaskStatus(record.status);
  const createdAt = string(record.createdAt);
  const updatedAt = string(record.updatedAt);
  const question = record.question === null ? null : readTaskQuestion(record.question);
  const schedule = record.schedule === null ? null : readTaskSchedule(record.schedule);
  const closureType = readClosureType(record.closureType);
  if (
    !id ||
    !title ||
    !status ||
    !createdAt ||
    !updatedAt ||
    (record.question !== null && !question) ||
    (record.schedule !== null && !schedule) ||
    (record.closureType !== null && !closureType)
  ) {
    return null;
  }
  return {
    closedAt: nullableString(record.closedAt),
    closureType,
    createdAt,
    description: nullableString(record.description),
    id,
    openedAt: nullableString(record.openedAt),
    publishedAt: nullableString(record.publishedAt),
    question,
    schedule,
    status,
    title,
    updatedAt,
  };
}

export function readTaskDetail(value: unknown): TaskDetail | null {
  const record = object(value);
  if (!record || !Array.isArray(record.lifecycleHistory)) return null;
  const task = readTask(record.task);
  const preparation = record.preparation === null ? null : readTaskPreparation(record.preparation);
  const capabilities = readTaskCapabilities(record.capabilities);
  const lifecycleHistory = record.lifecycleHistory.map(readTaskLifecycleEvent);
  return task &&
    capabilities &&
    (record.preparation === null || preparation) &&
    lifecycleHistory.every(Boolean)
    ? {
        task,
        preparation,
        capabilities,
        lifecycleHistory: lifecycleHistory as TaskLifecycleEvent[],
      }
    : null;
}

export function readTaskPreparationStartResponse(
  value: unknown,
): TaskPreparationStartResponse | null {
  const record = object(value);
  const taskId = record && string(record.taskId);
  const preparation = record && readTaskPreparation(record.preparation);
  return record && taskId && preparation && typeof record.replayed === "boolean"
    ? { taskId, preparation, replayed: record.replayed }
    : null;
}

export function readTaskResultSummary(value: unknown): TaskResultSummary | null {
  const record = object(value);
  if (
    !record ||
    record.schemaVersion !== "task-result-summary/v1" ||
    !integer(record.resultVersion) ||
    !nonNegativeInteger(record.responseCount) ||
    !Array.isArray(record.options)
  ) {
    return null;
  }
  const options = record.options.map((value) => {
    const item = object(value);
    const key = item && string(item.key);
    const content = item && string(item.content);
    return item && key && content && nonNegativeInteger(item.count)
      ? { key, content, count: item.count as number }
      : null;
  });
  if (options.some((item) => !item)) return null;
  const count = options.reduce((sum, option) => sum + (option?.count ?? 0), 0);
  if (count !== record.responseCount) return null;
  return {
    schemaVersion: "task-result-summary/v1",
    resultVersion: record.resultVersion as number,
    responseCount: record.responseCount as number,
    options: options as TaskResultSummary["options"],
  };
}

export async function readAdminProblem(response: Response): Promise<AdminProblem> {
  const body = object(
    await response
      .clone()
      .json()
      .catch(() => null),
  );
  const violations = Array.isArray(body?.violations)
    ? body.violations.flatMap((value) => {
        const item = object(value);
        const field = item && string(item.field);
        const message = item && (string(item.message) ?? string(item.reason));
        return field && message ? [{ field, message }] : [];
      })
    : [];
  const fieldErrors = object(body?.fieldErrors);
  if (fieldErrors) {
    for (const [field, value] of Object.entries(fieldErrors)) {
      const messages = Array.isArray(value) ? value : [value];
      for (const message of messages) {
        if (typeof message === "string" && message.length > 0) violations.push({ field, message });
      }
    }
  }
  const traceId =
    string(body?.traceId) ??
    string(body?.trace_id) ??
    string(body?.requestId) ??
    string(body?.request_id) ??
    response.headers.get("x-trace-id") ??
    response.headers.get("x-request-id") ??
    undefined;
  const detail = string(body?.detail) ?? string(body?.message);
  const retryAfter = response.headers.get("retry-after");
  const referencedRoomCount = nonNegativeInteger(body?.referencedRoomCount)
    ? (body?.referencedRoomCount as number)
    : undefined;
  return {
    status: response.status,
    code: string(body?.code) ?? `HTTP_${response.status}`,
    ...(detail ? { detail } : {}),
    ...(referencedRoomCount !== undefined ? { referencedRoomCount } : {}),
    ...(retryAfter ? { retryAfter } : {}),
    ...(traceId ? { traceId } : {}),
    violations,
  };
}

export function formatAdminProblem(problem: AdminProblem): string {
  const codeMessages: Readonly<Record<string, string>> = {
    CHAT_EXPORT_UNAVAILABLE:
      "대화 내역을 불러오는 서버가 다른 작업을 처리 중입니다. 자동 재시도를 마쳤지만 아직 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
    ROOM_CREATION_DECISION_CONFLICT: "다른 관리자가 이미 처리했습니다. 최신 상태를 확인했습니다.",
    ROOM_CATEGORY_IN_USE: "다른 토론방에서 사용 중인 카테고리는 삭제할 수 없습니다.",
    ROOM_CATEGORY_NAME_CONFLICT: "같은 이름의 카테고리가 이미 있습니다.",
    ROOM_CATEGORY_DEFAULT_PROTECTED: "기본 정책 카테고리는 삭제할 수 없습니다.",
    ROOM_CATEGORY_VERSION_CONFLICT:
      "다른 관리자가 카테고리를 변경했습니다. 최신 목록에서 다시 시도해 주세요.",
    ROOM_CATEGORY_ASSIGNMENT_VERSION_CONFLICT:
      "다른 관리자가 토론방을 변경했습니다. 최신 설정에서 다시 시도해 주세요.",
    USER_ACTIVE_ROOM_LIMIT_EXCEEDED: "신청자가 만들 수 있는 활성 토론방 수를 초과했습니다.",
    SIMULATION_NOT_COMPLETED: "아직 결과가 없습니다.",
    TASK_PREPARATION_UNAVAILABLE: "AI 답변 준비를 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    TASK_NOT_FOUND: "과업을 찾을 수 없습니다.",
    TASK_RESULT_NOT_ELIGIBLE: "현재 상태에서는 정성 요약 생성을 다시 시도할 수 없습니다.",
    OPINION_MAP_GENERATION_DISABLED: "정성 요약 생성 기능이 비활성화되어 있습니다.",
    TASK_RESULT_VIEW_INTEGRITY_FAILURE:
      "확정 결과와 저장된 정성 요약이 일치하지 않습니다. 서버 데이터 점검이 필요합니다.",
    TASK_RESULT_SUMMARY_NOT_FOUND: "아직 확정된 정량 결과가 없습니다.",
    TASK_RESULT_VIEW_NOT_FOUND: "아직 다운로드할 상세 결과가 없습니다.",
  };
  const base =
    codeMessages[problem.code] ??
    (problem.status === 403
      ? "이 작업을 수행할 관리자 권한이 없습니다."
      : problem.status === 429
        ? `요청이 많습니다.${problem.retryAfter ? ` ${problem.retryAfter}초 후 다시 시도하세요.` : " 잠시 후 다시 시도하세요."}`
        : (problem.detail ?? "요청을 처리하지 못했습니다."));
  return problem.code === "SIMULATION_NOT_COMPLETED" || !problem.traceId
    ? base
    : `${base} 문의 코드: ${problem.traceId}`;
}

export function adminFieldError(
  problem: AdminProblem | null,
  ...fieldNames: readonly string[]
): string | null {
  if (!problem) return null;
  const violation = problem.violations.find(({ field }) =>
    fieldNames.some((name) => field === name || field.endsWith(`.${name}`)),
  );
  return violation?.message ?? null;
}

export function validateRejectionReason(value: string): string | null {
  const reason = value.trim();
  const length = [...reason].length;
  if (length < 1 || length > 100) return "반려 사유는 1~100자로 입력해 주세요.";
  if (/\p{Cc}|\p{Zl}|\p{Zp}|[\r\n]/u.test(reason)) {
    return "반려 사유는 줄바꿈이나 제어문자 없이 한 줄로 입력해 주세요.";
  }
  return null;
}

export function canReadTaskResult(task: Pick<Task, "status" | "closureType">): boolean {
  return (
    task.status === "CLOSED" &&
    (task.closureType === "DEADLINE_REACHED" || task.closureType === "EARLY_CLOSED")
  );
}

function readTaskSummary(value: unknown): TaskSummary | null {
  const record = object(value);
  if (!record) return null;
  const taskId = string(record.taskId);
  const title = string(record.title);
  const status = readTaskStatus(record.status);
  const createdAt = string(record.createdAt);
  const updatedAt = string(record.updatedAt);
  const schedule = record.schedule === null ? null : readTaskSchedule(record.schedule);
  const closureType = readClosureType(record.closureType);
  if (
    !taskId ||
    !title ||
    !status ||
    !createdAt ||
    !updatedAt ||
    (record.schedule !== null && !schedule) ||
    (record.closureType !== null && !closureType)
  ) {
    return null;
  }
  return {
    taskId,
    title,
    status,
    schedule,
    publishedAt: nullableString(record.publishedAt),
    openedAt: nullableString(record.openedAt),
    closedAt: nullableString(record.closedAt),
    closureType,
    createdAt,
    updatedAt,
  };
}

function readTaskQuestion(value: unknown): TaskQuestion | null {
  const record = object(value);
  if (!record || !Array.isArray(record.options)) return null;
  const id = string(record.id);
  const content = string(record.content);
  const options = record.options.map(readTaskOption);
  return id && content && options.every(Boolean)
    ? {
        id,
        content,
        description: nullableString(record.description),
        options: options as TaskOption[],
      }
    : null;
}

function readTaskOption(value: unknown): TaskOption | null {
  const record = object(value);
  const id = record && string(record.id);
  const content = record && string(record.content);
  return record && id && content && integer(record.displayOrder)
    ? { id, content, displayOrder: record.displayOrder as number }
    : null;
}

function readTaskSchedule(value: unknown): TaskSchedule | null {
  const record = object(value);
  const opensAt = record && string(record.opensAt);
  const closesAt = record && string(record.closesAt);
  return opensAt && closesAt ? { opensAt, closesAt } : null;
}

function readTaskLifecycleEvent(value: unknown): TaskLifecycleEvent | null {
  const record = object(value);
  if (!record) return null;
  const id = string(record.id);
  const eventType = string(record.eventType);
  const trigger = string(record.trigger);
  const occurredAt = string(record.occurredAt);
  const previousStatus =
    record.previousStatus === null ? null : readTaskStatus(record.previousStatus);
  const newStatus = record.newStatus === null ? null : readTaskStatus(record.newStatus);
  const previousSchedule =
    record.previousSchedule === null ? null : readTaskSchedule(record.previousSchedule);
  const newSchedule = record.newSchedule === null ? null : readTaskSchedule(record.newSchedule);
  const closureType = readClosureType(record.closureType);
  if (
    !id ||
    !eventType ||
    !trigger ||
    !occurredAt ||
    (record.previousStatus !== null && !previousStatus) ||
    (record.newStatus !== null && !newStatus) ||
    (record.previousSchedule !== null && !previousSchedule) ||
    (record.newSchedule !== null && !newSchedule) ||
    (record.closureType !== null && !closureType)
  ) {
    return null;
  }
  return {
    id,
    eventType,
    previousStatus,
    newStatus,
    previousSchedule,
    newSchedule,
    trigger,
    actorId: nullableString(record.actorId),
    reason: nullableString(record.reason),
    closureType,
    occurredAt,
  };
}

function readTaskPreparation(value: unknown): TaskPreparationView | null {
  const record = object(value);
  if (!record) return null;
  const requestId = string(record.requestId);
  const status = string(record.status);
  const contentFingerprint = string(record.contentFingerprint);
  const updatedAt = string(record.updatedAt);
  const processingStartedAt = nullableString(record.processingStartedAt);
  const preparedAt = nullableString(record.preparedAt);
  const lastError = record.lastError === null ? null : readTaskPreparationError(record.lastError);
  if (
    !requestId ||
    !status ||
    !taskPreparationStatuses.has(status as TaskPreparationStatus) ||
    !contentFingerprint ||
    !contentFingerprintPattern.test(contentFingerprint) ||
    !nonNegativeInteger(record.attemptCount) ||
    (record.processingStartedAt !== null && !processingStartedAt) ||
    (record.preparedAt !== null && !preparedAt) ||
    (record.lastError !== null && !lastError) ||
    !updatedAt ||
    !taskPreparationStateIsConsistent(
      status as TaskPreparationStatus,
      processingStartedAt,
      preparedAt,
      lastError,
    )
  ) {
    return null;
  }
  return {
    requestId,
    status: status as TaskPreparationStatus,
    contentFingerprint,
    attemptCount: record.attemptCount as number,
    processingStartedAt,
    preparedAt,
    lastError,
    updatedAt,
  };
}

function taskPreparationStateIsConsistent(
  status: TaskPreparationStatus,
  processingStartedAt: string | null,
  preparedAt: string | null,
  lastError: TaskPreparationError | null,
): boolean {
  if (status === "PROCESSING") {
    return processingStartedAt !== null && preparedAt === null && lastError === null;
  }
  if (status === "READY") return preparedAt !== null && lastError === null;
  if (status === "FAILED") return preparedAt === null && lastError?.retryable === true;
  return preparedAt === null && lastError?.retryable === false;
}

function readTaskPreparationError(value: unknown): TaskPreparationError | null {
  const record = object(value);
  const code = record && string(record.code);
  const detail = record && string(record.detail);
  return record && code && detail && typeof record.retryable === "boolean"
    ? { code, detail, retryable: record.retryable }
    : null;
}

function readTaskCapabilities(value: unknown): TaskCapabilities | null {
  const record = object(value);
  if (
    !record ||
    typeof record.canEditContent !== "boolean" ||
    typeof record.canStartPreparation !== "boolean" ||
    typeof record.canSchedule !== "boolean" ||
    typeof record.canOpenNow !== "boolean"
  ) {
    return null;
  }
  return {
    canEditContent: record.canEditContent,
    canStartPreparation: record.canStartPreparation,
    canSchedule: record.canSchedule,
    canOpenNow: record.canOpenNow,
  };
}

function readTaskStatus(value: unknown): TaskStatus | null {
  const candidate = string(value);
  return candidate && taskStatuses.has(candidate as TaskStatus) ? (candidate as TaskStatus) : null;
}

function readClosureType(value: unknown): TaskClosureType | null {
  if (value === null || value === undefined) return null;
  const candidate = string(value);
  return candidate && closureTypes.has(candidate as TaskClosureType)
    ? (candidate as TaskClosureType)
    : null;
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function string(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : string(value);
}

function stringArray(value: unknown): readonly string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : null;
}

function integer(value: unknown): boolean {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function nonNegativeInteger(value: unknown): boolean {
  return integer(value) && (value as number) >= 0;
}

function nullableNonNegativeInteger(value: unknown): number | null {
  return value === null || value === undefined
    ? null
    : nonNegativeInteger(value)
      ? (value as number)
      : null;
}

function requiredStrings<T extends readonly string[]>(
  record: Record<string, unknown>,
  names: T,
): Record<T[number], string> | null {
  const output: Partial<Record<T[number], string>> = {};
  for (const name of names) {
    const value = string(record[name]);
    if (!value) return null;
    output[name as T[number]] = value;
  }
  return output as Record<T[number], string>;
}
