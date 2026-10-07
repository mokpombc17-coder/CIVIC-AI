import { VoteApiError } from "./vote-fetch";
import { formatPredictionWaitingMessage } from "./vote-task-prediction-presentation";
import type { TaskPredictionView } from "./vote-task-contracts";

type PredictionPreparationView = Pick<
  TaskPredictionView,
  | "predictionId"
  | "predictionRequestAllowed"
  | "runtimeStatus"
  | "state"
  | "submissionAllowed"
  | "waiting"
>;

export function getTaskSubmissionErrorMessage(error: unknown): string {
  if (error instanceof VoteApiError) {
    if (error.status === 401) return "로그인이 만료되었습니다. 다시 로그인해 주세요.";
    if (error.status === 403) return "과업을 제출할 권한이 없습니다.";
    if (error.code === "TASK_CURRENT_PERSONA_NOT_READY") {
      return "과업 참여 준비가 진행 중입니다. 잠시 후 다시 시도해 주세요.";
    }
    if (
      error.code === "TASK_SUBMISSION_AI_ACCEPTANCE_NOT_AVAILABLE" ||
      error.code === "TASK_SUBMISSION_PREDICTION_UNAVAILABLE" ||
      error.code === "TASK_SUBMISSION_REASON_OPTION_MISMATCH"
    ) {
      return "과업 참여 정보가 변경되었습니다. 준비가 완료된 뒤 다시 제출해 주세요.";
    }
    if (error.code === "TASK_PREDICTION_DISABLED") {
      return "AI 예상 이유를 사용할 수 없습니다. 직접 작성 가능 여부를 다시 확인해 주세요.";
    }
    if (error.code === "TASK_SUBMISSION_OPTION_MISMATCH") {
      return "선택지가 변경되었습니다. 과업 내용을 다시 확인해 주세요.";
    }
    if (
      error.code === "TASK_SUBMISSION_TASK_CLOSED" ||
      error.code === "TASK_SUBMISSION_TASK_UNPUBLISHED" ||
      error.code === "TASK_SUBMISSION_TASK_UNAVAILABLE"
    ) {
      return "현재 제출할 수 없는 과업입니다. 과업 목록을 다시 확인해 주세요.";
    }
    if (error.code === "TASK_SUBMISSION_REASON_REQUIRED") {
      return "응답 이유를 입력해 주세요.";
    }
    if (error.code === "TASK_SUBMISSION_REASON_TOO_LONG") {
      return "응답 이유는 500자 이하로 입력해 주세요.";
    }
    if (error.code === "TASK_SUBMISSION_VALIDATION_FAILED") {
      return "선택한 응답과 이유를 다시 확인해 주세요.";
    }
    if (error.code === "IDEMPOTENCY_CONFLICT") {
      return "제출 내용을 다시 확인한 뒤 재시도해 주세요.";
    }
  }

  return "제출 결과를 확인하지 못했습니다. 같은 내용으로 다시 시도해 주세요.";
}

export function getPredictionPreparationMessage({
  alreadySubmitted,
  view,
  predictionError,
  ensureError,
  ensurePending,
}: {
  alreadySubmitted: boolean;
  view: PredictionPreparationView | undefined;
  predictionError: unknown;
  ensureError: unknown;
  ensurePending: boolean;
}): string | null {
  if (alreadySubmitted) return "이미 참여한 투표입니다.";
  if (predictionError || ensureError) {
    return "투표 참여 정보를 준비하지 못했습니다. 잠시 후 다시 접속해 주세요.";
  }
  const predictionWaitingMessage = formatPredictionWaitingMessage(view);
  if (predictionWaitingMessage) return predictionWaitingMessage;
  if (view?.state === "FAILED") {
    return "AI 예상 답변을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (view?.submissionAllowed === true) return null;
  if (!view || ensurePending) return null;
  if (view.predictionRequestAllowed && !view.predictionId) return null;
  return "현재 응답을 작성할 수 없습니다.";
}
