import {
  sortPredictedReasons,
  submitTaskRequestSchema,
  type PredictedReason,
  type SubmitTaskRequest,
  type TaskPredictionView,
} from "./vote-task-contracts";

export type VoteReasonSelection =
  | Readonly<{ kind: "AI_ACCEPTED"; predictedReasonId: string }>
  | Readonly<{ kind: "USER_WRITTEN"; reason: string }>;

export function getPredictedReasonsForOption(
  view: TaskPredictionView | undefined,
  optionId: string | null,
): PredictedReason[] {
  if (
    !optionId ||
    !view?.aiAcceptanceAllowed ||
    !view.allowedReasonSources.includes("AI_ACCEPTED")
  ) {
    return [];
  }

  return sortPredictedReasons(
    view.predictedReasons.filter((reason) => reason.optionId === optionId),
  );
}

export function canStartTaskResponse(view: TaskPredictionView | undefined): boolean {
  return view?.submissionAllowed === true;
}

export function canWriteTaskReason(view: TaskPredictionView | undefined): boolean {
  return Boolean(
    view?.submissionAllowed &&
    view.directAnswerAllowed &&
    view.allowedReasonSources.includes("USER_WRITTEN"),
  );
}

export function createTaskSubmissionCommand({
  view,
  selectedOptionId,
  selection,
}: {
  view: TaskPredictionView | undefined;
  selectedOptionId: string;
  selection: VoteReasonSelection;
}): SubmitTaskRequest {
  if (!view?.submissionAllowed) {
    throw new Error("TASK_SUBMISSION_NOT_READY");
  }

  if (selection.kind === "AI_ACCEPTED") {
    const predictedReason = getPredictedReasonsForOption(view, selectedOptionId).find(
      (reason) => reason.id === selection.predictedReasonId,
    );
    if (!predictedReason) throw new Error("TASK_PREDICTED_REASON_NOT_AVAILABLE");

    return submitTaskRequestSchema.parse({
      selectedOptionId,
      reasonSource: "AI_ACCEPTED",
      predictedReasonId: predictedReason.id,
    });
  }

  if (!canWriteTaskReason(view)) throw new Error("TASK_USER_WRITTEN_NOT_AVAILABLE");
  return submitTaskRequestSchema.parse({
    selectedOptionId,
    reasonSource: "USER_WRITTEN",
    reason: selection.reason,
  });
}
