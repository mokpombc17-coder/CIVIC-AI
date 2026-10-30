import { submitTaskRequestSchema, type SubmitTaskRequest } from "./vote-task-contracts";

export type PendingTaskSubmission = Readonly<{
  taskId: string;
  idempotencyKey: string;
  command: SubmitTaskRequest;
}>;

const STORAGE_PREFIX = "civic-ai:vote:pending-task-submission:";

export function createPendingTaskSubmission(
  taskId: string,
  command: SubmitTaskRequest,
): PendingTaskSubmission {
  return {
    taskId,
    idempotencyKey: crypto.randomUUID(),
    command: submitTaskRequestSchema.parse(command),
  };
}

export function savePendingTaskSubmission(
  pending: PendingTaskSubmission,
  storage: Pick<Storage, "setItem"> = sessionStorage,
): void {
  storage.setItem(`${STORAGE_PREFIX}${pending.taskId}`, JSON.stringify(pending));
}

export function getOrCreatePendingTaskSubmission(
  taskId: string,
  command: SubmitTaskRequest,
  storage: Pick<Storage, "getItem" | "setItem"> = sessionStorage,
  createKey: () => string = () => crypto.randomUUID(),
): PendingTaskSubmission {
  const parsedCommand = submitTaskRequestSchema.parse(command);
  const existing = readPendingTaskSubmission(taskId, storage);
  if (existing && JSON.stringify(existing.command) === JSON.stringify(parsedCommand)) {
    return existing;
  }

  const pending = {
    taskId,
    idempotencyKey: createKey(),
    command: parsedCommand,
  } satisfies PendingTaskSubmission;
  savePendingTaskSubmission(pending, storage);
  return pending;
}

export function readPendingTaskSubmission(
  taskId: string,
  storage: Pick<Storage, "getItem"> = sessionStorage,
): PendingTaskSubmission | null {
  const serialized = storage.getItem(`${STORAGE_PREFIX}${taskId}`);
  if (!serialized) return null;

  try {
    const value = JSON.parse(serialized) as Record<string, unknown>;
    if (value.taskId !== taskId || typeof value.idempotencyKey !== "string") return null;
    return {
      taskId,
      idempotencyKey: value.idempotencyKey,
      command: submitTaskRequestSchema.parse(value.command),
    };
  } catch {
    return null;
  }
}

export function clearPendingTaskSubmission(
  taskId: string,
  storage: Pick<Storage, "removeItem"> = sessionStorage,
): void {
  storage.removeItem(`${STORAGE_PREFIX}${taskId}`);
}

export function clearAllPendingTaskSubmissions(
  storage: Pick<Storage, "key" | "length" | "removeItem"> = sessionStorage,
): void {
  const pendingSubmissionKeys = Array.from({ length: storage.length }, (_, index) =>
    storage.key(index),
  ).filter((key): key is string => key?.startsWith(STORAGE_PREFIX) ?? false);

  for (const key of pendingSubmissionKeys) {
    storage.removeItem(key);
  }
}
