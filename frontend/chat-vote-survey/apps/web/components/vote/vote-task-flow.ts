import type { PendingTaskSubmission } from "@/lib/vote/vote-idempotent-submission";

export type VoteStep = 1 | 2 | 3 | 4;

export type ReasonChoice =
  | Readonly<{ kind: "AI_ACCEPTED"; predictedReasonId: string }>
  | Readonly<{ kind: "USER_WRITTEN" }>
  | null;

export type VoteTaskFlowState = Readonly<{
  cancelOpen: boolean;
  directReason: string;
  directReasonError: string | null;
  reasonChoice: ReasonChoice;
  recoverableSubmission: PendingTaskSubmission | null;
  selectedOptionId: string | null;
  step: VoteStep;
  submissionError: string | null;
}>;

export type VoteTaskFlowEvent =
  | Readonly<{ type: "cancel-changed"; open: boolean }>
  | Readonly<{ type: "direct-reason-changed"; value: string }>
  | Readonly<{ type: "option-chosen"; optionId: string }>
  | Readonly<{ type: "option-mismatch" }>
  | Readonly<{ type: "prediction-invalidated"; clearAcceptedReason: boolean }>
  | Readonly<{ type: "reason-chosen"; choice: NonNullable<ReasonChoice> }>
  | Readonly<{ type: "recoverable-submission-cleared" }>
  | Readonly<{ type: "recoverable-submission-stored"; pending: PendingTaskSubmission }>
  | Readonly<{ type: "submission-completed" }>
  | Readonly<{ type: "submission-error-changed"; message: string | null }>
  | Readonly<{ type: "submission-reset" }>
  | Readonly<{ type: "confirmation-requested"; reasonReady: boolean }>
  | Readonly<{ type: "step-changed"; step: VoteStep }>;

export const DIRECT_REASON_MAX_LENGTH = 500;

export function createVoteTaskFlowState(
  recoverableSubmission: PendingTaskSubmission | null,
): VoteTaskFlowState {
  return {
    cancelOpen: false,
    directReason: "",
    directReasonError: null,
    reasonChoice: null,
    recoverableSubmission,
    selectedOptionId: null,
    step: 1,
    submissionError: null,
  };
}

export function reduceVoteTaskFlow(
  state: VoteTaskFlowState,
  event: VoteTaskFlowEvent,
): VoteTaskFlowState {
  switch (event.type) {
    case "cancel-changed":
      return { ...state, cancelOpen: event.open };
    case "direct-reason-changed":
      return {
        ...state,
        directReason: event.value,
        directReasonError:
          getVoteReasonLength(event.value) > DIRECT_REASON_MAX_LENGTH
            ? "응답 이유는 500자 이하로 입력해 주세요."
            : null,
      };
    case "option-chosen":
      return {
        ...state,
        directReason: "",
        directReasonError: null,
        reasonChoice: null,
        selectedOptionId: state.selectedOptionId === event.optionId ? null : event.optionId,
      };
    case "option-mismatch":
      return {
        ...state,
        directReason: "",
        reasonChoice: null,
        recoverableSubmission: null,
        selectedOptionId: null,
        step: 1,
      };
    case "prediction-invalidated":
      return {
        ...state,
        reasonChoice: event.clearAcceptedReason ? null : state.reasonChoice,
        recoverableSubmission: null,
      };
    case "reason-chosen":
      return {
        ...state,
        directReasonError: null,
        reasonChoice: isSameReasonChoice(state.reasonChoice, event.choice) ? null : event.choice,
      };
    case "recoverable-submission-cleared":
      return { ...state, recoverableSubmission: null };
    case "recoverable-submission-stored":
      return { ...state, recoverableSubmission: event.pending };
    case "submission-completed":
      return { ...state, recoverableSubmission: null, step: 4 };
    case "submission-error-changed":
      return { ...state, submissionError: event.message };
    case "submission-reset":
      return { ...state, recoverableSubmission: null, submissionError: null };
    case "confirmation-requested": {
      if (state.reasonChoice?.kind === "USER_WRITTEN" && !state.directReason.trim()) {
        return { ...state, directReasonError: "응답 이유를 입력해 주세요." };
      }
      if (
        state.reasonChoice?.kind === "USER_WRITTEN" &&
        getVoteReasonLength(state.directReason) > DIRECT_REASON_MAX_LENGTH
      ) {
        return { ...state, directReasonError: "응답 이유는 500자 이하로 입력해 주세요." };
      }
      return state.selectedOptionId && event.reasonReady ? { ...state, step: 3 } : state;
    }
    case "step-changed":
      return { ...state, step: event.step };
  }
}

export function getVoteReasonLength(reason: string): number {
  return Array.from(reason.trim()).length;
}

function isSameReasonChoice(left: ReasonChoice, right: NonNullable<ReasonChoice>): boolean {
  if (!left || left.kind !== right.kind) return false;
  if (left.kind === "USER_WRITTEN") return true;
  return right.kind === "AI_ACCEPTED" && left.predictedReasonId === right.predictedReasonId;
}
