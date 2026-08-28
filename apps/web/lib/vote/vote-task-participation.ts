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

type ReadyPredictionView = TaskPredictionView & {
  personaGenerationId: string;
  personaVersionId: string;
  predictionId: string;
};

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
  if (!hasSubmissionIdentity(view) || !view.submissionAllowed) return false;

  const aiAvailable =
    view.aiAcceptanceAllowed &&
    view.allowedReasonSources.includes("AI_ACCEPTED") &&
    view.predictedReasons.length > 0;
  const directAvailable =
    view.directAnswerAllowed && view.allowedReasonSources.includes("USER_WRITTEN");
  return aiAvailable || directAvailable;
}

export function canWriteTaskReason(view: TaskPredictionView | undefined): boolean {
  return Boolean(
    hasSubmissionIdentity(view) &&
    view.submissionAllowed &&
    view.directAnswerAllowed &&
    view.allowedReasonSources.includes("USER_WRITTEN"),
  );
}

export function createTaskSubmissionCommand({
  view,
  questionId,
  selectedOptionId,
  selection,
}: {
  view: TaskPredictionView | undefined;
  questionId: string;
  selectedOptionId: string;
  selection: VoteReasonSelection;
}): SubmitTaskRequest {
  if (!hasSubmissionIdentity(view) || !view.submissionAllowed) {
    throw new Error("TASK_SUBMISSION_NOT_READY");
  }

  const identity = {
    personaGenerationId: view.personaGenerationId,
    personaVersionId: view.personaVersionId,
    predictionId: view.predictionId,
    questionId,
    selectedOptionId,
  };

  if (selection.kind === "AI_ACCEPTED") {
    const predictedReason = getPredictedReasonsForOption(view, selectedOptionId).find(
      (reason) => reason.id === selection.predictedReasonId,
    );
    if (!predictedReason) throw new Error("TASK_PREDICTED_REASON_NOT_AVAILABLE");

    return submitTaskRequestSchema.parse({
      ...identity,
      reasonSource: "AI_ACCEPTED",
      acceptedPredictedReasonId: predictedReason.id,
      reason: null,
    });
  }

  if (!canWriteTaskReason(view)) throw new Error("TASK_USER_WRITTEN_NOT_AVAILABLE");
  return submitTaskRequestSchema.parse({
    ...identity,
    reasonSource: "USER_WRITTEN",
    reason: selection.reason,
  });
}

function hasSubmissionIdentity(view: TaskPredictionView | undefined): view is ReadyPredictionView {
  return Boolean(view?.personaGenerationId && view.personaVersionId && view.predictionId);
}
