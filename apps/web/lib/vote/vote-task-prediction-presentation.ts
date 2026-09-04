import type { PredictionRuntimeStatus } from "./vote-task-contracts";

export function formatPredictionRuntimeStatus(
  runtimeStatus: PredictionRuntimeStatus | null,
): string | null {
  if (!runtimeStatus) return null;
  if (runtimeStatus.maxWaitMinutes <= 0) return runtimeStatus.detail;
  return `${runtimeStatus.detail} 최대 예상 대기시간은 ${runtimeStatus.maxWaitMinutes}분입니다.`;
}
