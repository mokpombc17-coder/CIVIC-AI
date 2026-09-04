import {
  canReadTaskResult,
  formatAdminProblem,
  readAdminProblem,
  readTaskDetail,
  readTaskResultSummary,
  type Task,
} from "./domain-contracts";

export type TaskProgressSummary = Readonly<{
  taskId: string;
  status: "OPEN";
  observedAt: string;
  submissionCount: number;
  options: readonly Readonly<{
    optionId: string;
    content: string;
    count: number;
    rate: number;
  }>[];
}>;

export type TaskResults = Readonly<{
  task: Task;
  observedAt: string | null;
  responseCount: number;
  options: readonly Readonly<{ key: string; content: string; count: number; rate: number }>[];
}>;

export function canViewTaskResults(task: Pick<Task, "status" | "closureType">): boolean {
  return task.status === "OPEN" || canReadTaskResult(task);
}

export function readTaskProgressSummary(value: unknown): TaskProgressSummary | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.taskId !== "string" ||
    !record.taskId ||
    record.status !== "OPEN" ||
    typeof record.observedAt !== "string" ||
    !Number.isFinite(Date.parse(record.observedAt)) ||
    typeof record.submissionCount !== "number" ||
    !Number.isSafeInteger(record.submissionCount) ||
    record.submissionCount < 0 ||
    !Array.isArray(record.options)
  )
    return null;

  const options: TaskProgressSummary["options"][number][] = [];
  const ids = new Set<string>();
  for (const value of record.options) {
    if (!value || typeof value !== "object") return null;
    const item = value as Record<string, unknown>;
    if (
      typeof item.optionId !== "string" ||
      !item.optionId ||
      ids.has(item.optionId) ||
      typeof item.content !== "string" ||
      !item.content ||
      typeof item.count !== "number" ||
      !Number.isSafeInteger(item.count) ||
      item.count < 0 ||
      typeof item.rate !== "number" ||
      !Number.isFinite(item.rate) ||
      item.rate < 0 ||
      item.rate > 1
    )
      return null;
    const expectedRate = record.submissionCount === 0 ? 0 : item.count / record.submissionCount;
    if (Math.abs(item.rate - expectedRate) > 1e-12) return null;
    ids.add(item.optionId);
    options.push({
      optionId: item.optionId,
      content: item.content,
      count: item.count,
      rate: item.rate,
    });
  }
  if (options.reduce((total, item) => total + item.count, 0) !== record.submissionCount)
    return null;
  return {
    taskId: record.taskId,
    status: "OPEN",
    observedAt: record.observedAt,
    submissionCount: record.submissionCount,
    options,
  };
}

export async function loadTaskResults(
  taskId: string,
  request: typeof fetch,
  signal?: AbortSignal,
): Promise<TaskResults> {
  const base = `/api/v1/admin/tasks/${encodeURIComponent(taskId)}`;
  const init: RequestInit = { cache: "no-store", signal: signal ?? null };
  async function readCurrentTask(): Promise<Task> {
    const response = await request(base, init);
    if (!response.ok) throw new Error(formatAdminProblem(await readAdminProblem(response)));
    const detail = readTaskDetail(await response.json());
    if (!detail || detail.task.id !== taskId) throw new Error("과업 상세를 불러오지 못했습니다.");
    return detail.task;
  }

  let task = await readCurrentTask();
  if (task.status === "OPEN") {
    const response = await request(`${base}/progress-summary`, init);
    if (response.ok) {
      const summary = readTaskProgressSummary(await response.json());
      if (!summary || summary.taskId !== taskId)
        throw new Error("서버의 집계 응답 형식을 확인해야 합니다.");
      return {
        task,
        observedAt: summary.observedAt,
        responseCount: summary.submissionCount,
        options: summary.options.map(({ optionId, ...option }) => ({ key: optionId, ...option })),
      };
    }
    const problem = await readAdminProblem(response);
    if (response.status !== 409 || problem.code !== "TASK_PROGRESS_SUMMARY_NOT_AVAILABLE") {
      throw new Error(formatAdminProblem(problem));
    }
    // The task can close between reading its detail and reading the live aggregate.
    task = await readCurrentTask();
    if (task.status === "OPEN")
      throw new Error("과업 상태가 변경 중입니다. 잠시 후 새로고침해 주세요.");
  }
  if (!canReadTaskResult(task)) {
    throw new Error("진행 중이거나 정상 마감 또는 조기 종료된 과업만 결과를 조회할 수 있습니다.");
  }
  const response = await request(`${base}/result-summary`, init);
  if (!response.ok) throw new Error(formatAdminProblem(await readAdminProblem(response)));
  const summary = readTaskResultSummary(await response.json());
  if (!summary) throw new Error("서버의 결과 응답 형식을 확인해야 합니다.");
  return {
    task,
    observedAt: null,
    responseCount: summary.responseCount,
    options: summary.options.map((option) => ({
      ...option,
      rate: summary.responseCount === 0 ? 0 : option.count / summary.responseCount,
    })),
  };
}
