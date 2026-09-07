import type { PredictionRuntimeStatus, TaskPredictionView } from "./vote-task-contracts";

export function formatPredictionRuntimeStatus(
  runtimeStatus: PredictionRuntimeStatus | null,
): string | null {
  if (!runtimeStatus) return null;
  if (runtimeStatus.maxWaitMinutes <= 0) return runtimeStatus.detail;
  const waitTime = `최대 예상 대기시간은 ${runtimeStatus.maxWaitMinutes}분입니다.`;
  return runtimeStatus.code === "PREDICTION_NOT_READY"
    ? `${runtimeStatus.detail}\n${waitTime}`
    : `${runtimeStatus.detail} ${waitTime}`;
}

export function isPredictionNotReady(
  view: Pick<TaskPredictionView, "runtimeStatus"> | undefined,
): boolean {
  return view?.runtimeStatus?.code === "PREDICTION_NOT_READY";
}
