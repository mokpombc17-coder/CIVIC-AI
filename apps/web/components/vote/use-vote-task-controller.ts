"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useFeatureFailureAnalytics } from "@/components/use-feature-failure-analytics";
import { getFeatureFailureDetails } from "@/lib/analytics/feature-failure-analytics";
import { VoteApiError } from "@/lib/vote/vote-fetch";
import {
  clearPendingTaskSubmission,
  getOrCreatePendingTaskSubmission,
  readPendingTaskSubmission,
  type PendingTaskSubmission,
} from "@/lib/vote/vote-idempotent-submission";
import {
  useOpenTaskQuery,
  useSubmitTaskMutation,
  useTaskPredictionCoordinator,
  useTaskSubmissionQuery,
  voteQueryKeys,
} from "@/lib/vote/vote-queries";
import { classifyVoteSubmissionFailure } from "@/lib/vote/vote-submission-recovery";
import {
  canStartTaskResponse,
  canWriteTaskReason,
  createTaskSubmissionCommand,
  getPredictedReasonsForOption,
  type VoteReasonSelection,
} from "@/lib/vote/vote-task-participation";
import {
  formatPredictionWaitingMessage,
  isPredictionNotReady,
} from "@/lib/vote/vote-task-prediction-presentation";
import {
  sortTaskOptions,
  type TaskPredictionView,
  type UserTaskDetail,
} from "@/lib/vote/vote-task-contracts";
import { useVoteParticipationAnalytics } from "./use-vote-participation-analytics";
import {
  createVoteTaskFlowState,
  DIRECT_REASON_MAX_LENGTH,
  getVoteReasonLength,
  reduceVoteTaskFlow,
  type ReasonChoice,
  type VoteStep,
} from "./vote-task-flow";

const SUBMISSION_LOADING_DELAY_MS = 150;
const SUBMISSION_LOADING_MIN_VISIBLE_MS = 300;

export function useVoteTaskController(taskId: string) {
  const queryClient = useQueryClient();
  const failureAnalytics = useFeatureFailureAnalytics("vote", `task:${taskId}`);
  const taskQuery = useOpenTaskQuery(taskId);
  const { predictionQuery, ensureMutation } = useTaskPredictionCoordinator(
    taskId,
    Boolean(taskQuery.data && !taskQuery.data.submission.submitted),
  );
  const submissionMutation = useSubmitTaskMutation(taskId);
  const [flow, dispatch] = useReducer(reduceVoteTaskFlow, taskId, (initialTaskId) =>
    createVoteTaskFlowState(
      typeof window === "undefined" ? null : readPendingTaskSubmission(initialTaskId),
    ),
  );
  const taskDetail = taskQuery.data;
  const isViewingSubmittedResponse = Boolean(taskDetail?.submission.submitted && flow.step === 1);
  const isRecoveringSubmission = Boolean(
    taskDetail && !taskDetail.submission.submitted && flow.recoverableSubmission && flow.step === 1,
  );
  const taskSubmissionQuery = useTaskSubmissionQuery(taskId, isViewingSubmittedResponse);
  const showSubmissionLoading = useDelayedLoadingIndicator(
    isViewingSubmittedResponse && taskSubmissionQuery.isPending,
    SUBMISSION_LOADING_DELAY_MS,
    SUBMISSION_LOADING_MIN_VISIBLE_MS,
  );
  const options = useMemo(
    () => sortTaskOptions(taskDetail?.task.question.options ?? []),
    [taskDetail?.task.question.options],
  );
  const selectedOption = options.find(({ id }) => id === flow.selectedOptionId);
  const predictionView = predictionQuery.data;
  const participationReady = canStartTaskResponse(predictionView);
  const predictionFailed = predictionView?.state === "FAILED";
  const predictionNotReady = isPredictionNotReady(predictionView);
  const predictionWaiting = Boolean(predictionView?.waiting || predictionNotReady);
  const predictionRequestPending = Boolean(
    predictionView?.predictionRequestAllowed && !predictionView.predictionId,
  );
  const predictionPreparationLoading =
    predictionQuery.isPending ||
    ensureMutation.isPending ||
    predictionWaiting ||
    predictionRequestPending;
  const predictedReasons = getPredictedReasonsForOption(predictionView, flow.selectedOptionId);
  const selectedPredictedReason = predictedReasons.find(
    (reason) =>
      flow.reasonChoice?.kind === "AI_ACCEPTED" &&
      reason.id === flow.reasonChoice.predictedReasonId,
  );
  const directReasonAllowed = canWriteTaskReason(predictionView);
  const preparationMessage = getPredictionPreparationMessage({
    detail: taskDetail,
    view: predictionView,
    predictionError: predictionQuery.error,
    ensureError: ensureMutation.error,
    ensurePending: ensureMutation.isPending,
  });
  const trimmedDirectReason = flow.directReason.trim();
  const directReasonLength = getVoteReasonLength(flow.directReason);
  const reasonReady = Boolean(
    selectedPredictedReason ||
    (flow.reasonChoice?.kind === "USER_WRITTEN" &&
      trimmedDirectReason &&
      directReasonLength <= DIRECT_REASON_MAX_LENGTH),
  );
  const confirmationReason = selectedPredictedReason?.reason ?? trimmedDirectReason;
  const participationFlowVisible = Boolean(
    taskDetail && !isViewingSubmittedResponse && !isRecoveringSubmission,
  );
  const { trackSubmissionAttempted } = useVoteParticipationAnalytics({
    flowVisible: participationFlowVisible,
    participationReady,
    predictionPreparationFailed:
      predictionQuery.isError || ensureMutation.isError || predictionFailed,
    step: flow.step,
    taskId,
  });

  useEffect(() => {
    if (taskQuery.isError) {
      failureAnalytics.trackFailure({
        ...getFeatureFailureDetails(taskQuery.error, "api", "vote_task_load_failed"),
        incidentKey: "task-detail-load",
        operation: "screen_load",
        retryCount: Math.max(0, taskQuery.failureCount - 1),
        surface: "participation",
      });
      return;
    }
    if (taskQuery.isSuccess) failureAnalytics.trackRecovered("task-detail-load");
  }, [
    failureAnalytics,
    taskQuery.error,
    taskQuery.failureCount,
    taskQuery.isError,
    taskQuery.isSuccess,
  ]);

  useEffect(() => {
    if (!isViewingSubmittedResponse) return;
    if (taskSubmissionQuery.isError) {
      failureAnalytics.trackFailure({
        ...getFeatureFailureDetails(
          taskSubmissionQuery.error,
          "api",
          "vote_submission_view_load_failed",
        ),
        incidentKey: "submission-view-load",
        operation: "screen_load",
        retryCount: Math.max(0, taskSubmissionQuery.failureCount - 1),
        surface: "submitted_response",
      });
      return;
    }
    if (taskSubmissionQuery.isSuccess) failureAnalytics.trackRecovered("submission-view-load");
  }, [
    failureAnalytics,
    isViewingSubmittedResponse,
    taskSubmissionQuery.error,
    taskSubmissionQuery.failureCount,
    taskSubmissionQuery.isError,
    taskSubmissionQuery.isSuccess,
  ]);

  useEffect(() => {
    const predictionPreparationFailed =
      predictionQuery.isError || ensureMutation.isError || predictionFailed;
    if (predictionPreparationFailed) {
      const error =
        predictionQuery.error ??
        ensureMutation.error ??
        ({ code: predictionView?.failureCode ?? "prediction_failed", retryable: true } as const);
      failureAnalytics.trackFailure({
        ...getFeatureFailureDetails(error, "api", "prediction_failed"),
        incidentKey: "ai-preparation",
        operation: "ai_preparation",
        retryCount: Math.max(0, predictionQuery.failureCount - 1),
        step: 1,
        surface: "participation",
      });
      return;
    }
    if (participationReady) failureAnalytics.trackRecovered("ai-preparation");
  }, [
    ensureMutation.error,
    ensureMutation.isError,
    failureAnalytics,
    participationReady,
    predictionFailed,
    predictionQuery.error,
    predictionQuery.failureCount,
    predictionQuery.isError,
    predictionView?.failureCode,
  ]);

  useEffect(() => {
    if (taskDetail?.submission.submitted) clearPendingTaskSubmission(taskId);
  }, [taskDetail?.submission.submitted, taskId]);

  function resetSubmissionAttempt() {
    clearPendingTaskSubmission(taskId);
    submissionMutation.reset();
    dispatch({ type: "submission-reset" });
  }

  function chooseOption(optionId: string) {
    resetSubmissionAttempt();
    dispatch({ type: "option-chosen", optionId });
  }

  function chooseReason(choice: NonNullable<ReasonChoice>) {
    resetSubmissionAttempt();
    dispatch({ type: "reason-chosen", choice });
  }

  function changeDirectReason(value: string) {
    resetSubmissionAttempt();
    dispatch({ type: "direct-reason-changed", value });
  }

  async function submitResponse() {
    if (!taskDetail || !flow.selectedOptionId || !flow.reasonChoice || !reasonReady) return;
    if (!canStartTaskResponse(predictionView)) {
      dispatch({
        type: "submission-error-changed",
        message: "과업 참여 준비가 완료되지 않았습니다. 잠시 후 다시 시도해 주세요.",
      });
      return;
    }

    try {
      const selection: VoteReasonSelection =
        flow.reasonChoice.kind === "AI_ACCEPTED"
          ? flow.reasonChoice
          : { kind: "USER_WRITTEN", reason: trimmedDirectReason };
      const command = createTaskSubmissionCommand({
        view: predictionView,
        selectedOptionId: flow.selectedOptionId,
        selection,
      });
      const pending = getOrCreatePendingTaskSubmission(taskId, command);
      await submitPendingTask(pending);
    } catch (error) {
      failureAnalytics.trackFailure({
        ...getFeatureFailureDetails(error, "client", "vote_submission_prepare_failed"),
        failureStage: "prepare",
        incidentKey: "submission",
        operation: "submission",
        step: flow.step,
        surface: "participation",
      });
      dispatch({
        type: "submission-error-changed",
        message: getTaskSubmissionErrorMessage(error),
      });
    }
  }

  async function submitPendingTask(pending: PendingTaskSubmission) {
    dispatch({ type: "submission-error-changed", message: null });
    failureAnalytics.trackRecoveryAttempt("submission", "user_retry");
    trackSubmissionAttempted();
    try {
      await submissionMutation.mutateAsync(pending);
      failureAnalytics.trackRecovered("submission");
      clearPendingTaskSubmission(taskId);
      dispatch({ type: "submission-completed" });
    } catch (error) {
      const recovery = classifyVoteSubmissionFailure(error);

      if (recovery.kind === "network-failure") {
        dispatch({ type: "recoverable-submission-stored", pending });
      } else {
        clearPendingTaskSubmission(taskId);
        dispatch({ type: "recoverable-submission-cleared" });
      }

      if (recovery.kind === "already-submitted") {
        failureAnalytics.trackRecovered("submission");
        dispatch({ type: "step-changed", step: 1 });
        void Promise.all([
          taskSubmissionQuery.refetch(),
          queryClient.invalidateQueries({ queryKey: voteQueryKeys.openTasks() }),
          queryClient.invalidateQueries({ queryKey: voteQueryKeys.detail(taskId) }),
          queryClient.invalidateQueries({ queryKey: voteQueryKeys.submissionByTask(taskId) }),
        ]);
        return;
      }

      if (recovery.kind === "option-mismatch") {
        dispatch({ type: "option-mismatch" });
        void taskQuery.refetch();
      }

      if (recovery.kind === "prediction-invalidated") {
        dispatch({
          type: "prediction-invalidated",
          clearAcceptedReason: flow.reasonChoice?.kind === "AI_ACCEPTED",
        });
        void predictionQuery.refetch();
      }

      if (recovery.kind !== "option-mismatch") {
        failureAnalytics.trackFailure({
          ...getFeatureFailureDetails(error, "api", "vote_submission_failed"),
          failureStage: "submit",
          incidentKey: "submission",
          operation: "submission",
          step: flow.step,
          surface: "participation",
        });
      }
      dispatch({
        type: "submission-error-changed",
        message: getTaskSubmissionErrorMessage(error),
      });
    }
  }

  function retryPredictionPreparation() {
    failureAnalytics.trackRecoveryAttempt("ai-preparation", "user_retry");
    if (predictionQuery.isError) {
      void predictionQuery.refetch();
      return;
    }
    ensureMutation.mutate();
  }

  return {
    actions: {
      changeDirectReason,
      chooseOption,
      chooseReason,
      closeCancel: () => dispatch({ type: "cancel-changed", open: false }),
      discardPendingSubmission: resetSubmissionAttempt,
      goToStep: (step: VoteStep) => dispatch({ type: "step-changed", step }),
      moveToConfirmation: () => dispatch({ type: "confirmation-requested", reasonReady }),
      openCancel: () => dispatch({ type: "cancel-changed", open: true }),
      retryPendingSubmission: () => {
        if (flow.recoverableSubmission) void submitPendingTask(flow.recoverableSubmission);
      },
      retryPredictionPreparation,
      retrySubmissionView: () => {
        failureAnalytics.trackRecoveryAttempt("submission-view-load", "user_retry");
        void taskSubmissionQuery.refetch();
      },
      retryTaskLoad: () => {
        failureAnalytics.trackRecoveryAttempt("task-detail-load", "user_retry");
        void taskQuery.refetch();
      },
      submitResponse: () => void submitResponse(),
    },
    model: {
      ...flow,
      canRetryPreparation: predictionQuery.isError || ensureMutation.isError,
      confirmationReason,
      directReasonAllowed,
      directReasonLength,
      isRecoveringSubmission,
      isSubmitting: submissionMutation.isPending,
      isViewingSubmittedResponse,
      options,
      participationReady,
      predictedReasons,
      predictionFailed,
      predictionPreparationLoading,
      predictionView,
      preparationMessage,
      reasonReady,
      selectedOption,
      showParticipationAction:
        predictionQuery.isError ||
        ensureMutation.isError ||
        (!predictionFailed && !predictionPreparationLoading),
      showSubmissionLoading,
      taskDetail,
      taskError: taskQuery.error,
      taskIsError: taskQuery.isError,
      taskIsPending: taskQuery.isPending,
      taskSubmission: taskSubmissionQuery.data,
      taskSubmissionError: taskSubmissionQuery.error,
      taskSubmissionIsError: taskSubmissionQuery.isError,
    },
  };
}

function useDelayedLoadingIndicator(
  pending: boolean,
  delayMs: number,
  minimumVisibleMs: number,
): boolean {
  const [visible, setVisible] = useState(false);
  const visibleSinceRef = useRef<number | null>(null);

  useEffect(() => {
    if (pending) {
      if (visible) return;

      const showTimer = window.setTimeout(() => {
        visibleSinceRef.current = Date.now();
        setVisible(true);
      }, delayMs);

      return () => window.clearTimeout(showTimer);
    }

    if (!visible) {
      visibleSinceRef.current = null;
      return;
    }

    const elapsed = Date.now() - (visibleSinceRef.current ?? Date.now());
    const hideTimer = window.setTimeout(
      () => {
        visibleSinceRef.current = null;
        setVisible(false);
      },
      Math.max(0, minimumVisibleMs - elapsed),
    );

    return () => window.clearTimeout(hideTimer);
  }, [delayMs, minimumVisibleMs, pending, visible]);

  return visible;
}

function getTaskSubmissionErrorMessage(error: unknown): string {
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

function getPredictionPreparationMessage({
  detail,
  view,
  predictionError,
  ensureError,
  ensurePending,
}: {
  detail: UserTaskDetail | undefined;
  view: TaskPredictionView | undefined;
  predictionError: unknown;
  ensureError: unknown;
  ensurePending: boolean;
}): string | null {
  if (detail?.submission.submitted) return "이미 참여한 투표입니다.";
  if (predictionError || ensureError) {
    return "투표 참여 정보를 준비하지 못했습니다. 잠시 후 다시 접속해 주세요.";
  }
  const predictionWaitingMessage = formatPredictionWaitingMessage(view);
  if (predictionWaitingMessage) return predictionWaitingMessage;
  if (view?.state === "FAILED") {
    return "AI 예상 답변을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (canStartTaskResponse(view)) return null;
  if (!view || ensurePending) return null;
  if (view.predictionRequestAllowed && !view.predictionId) return null;
  return "현재 응답을 작성할 수 없습니다.";
}
