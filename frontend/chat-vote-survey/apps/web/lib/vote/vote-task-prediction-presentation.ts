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

export function formatPredictionWaitingMessage(
  view: Pick<TaskPredictionView, "runtimeStatus" | "waiting"> | undefined,
): string | null {
  const runtimeStatusMessage = formatPredictionRuntimeStatus(view?.runtimeStatus ?? null);
  if (runtimeStatusMessage) return runtimeStatusMessage;
  return view?.waiting ? "AI 예상 이유를 준비 중입니다." : null;
}

export function isPredictionNotReady(
  view: Pick<TaskPredictionView, "runtimeStatus"> | undefined,
): boolean {
  return view?.runtimeStatus?.code === "PREDICTION_NOT_READY";
}
