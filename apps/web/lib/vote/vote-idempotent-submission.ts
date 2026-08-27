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
