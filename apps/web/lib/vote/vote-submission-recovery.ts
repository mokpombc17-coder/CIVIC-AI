import { VoteApiError } from "./vote-fetch";

export type VoteSubmissionRecovery =
  | Readonly<{ kind: "already-submitted" }>
  | Readonly<{ kind: "api-failure" }>
  | Readonly<{ kind: "network-failure" }>
  | Readonly<{ kind: "option-mismatch" }>
  | Readonly<{ kind: "prediction-invalidated" }>;

const PREDICTION_INVALIDATION_CODES = new Set([
  "TASK_CURRENT_PERSONA_NOT_READY",
  "TASK_SUBMISSION_AI_ACCEPTANCE_NOT_AVAILABLE",
  "TASK_SUBMISSION_PREDICTION_UNAVAILABLE",
  "TASK_SUBMISSION_REASON_OPTION_MISMATCH",
  "TASK_PREDICTION_DISABLED",
]);

export function classifyVoteSubmissionFailure(error: unknown): VoteSubmissionRecovery {
  if (!(error instanceof VoteApiError)) return { kind: "network-failure" };
  if (error.code === "TASK_ALREADY_SUBMITTED") return { kind: "already-submitted" };
  if (error.code === "TASK_SUBMISSION_OPTION_MISMATCH") return { kind: "option-mismatch" };
  if (error.code && PREDICTION_INVALIDATION_CODES.has(error.code)) {
    return { kind: "prediction-invalidated" };
  }
  return { kind: "api-failure" };
}
