"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { PlatformNavigationClient } from "@/components/platform-navigation-client";
import {
  PlatformHeader,
  PlatformShell,
  type PlatformHeaderBackAction,
} from "@/components/platform-shell";
import { VoteApiError } from "@/lib/vote/vote-fetch";
import { formatVoteDateTime } from "@/lib/vote/vote-format";
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
import {
  canStartTaskResponse,
  canWriteTaskReason,
  createTaskSubmissionCommand,
  getPredictedReasonsForOption,
  type VoteReasonSelection,
} from "@/lib/vote/vote-task-participation";
import {
  sortTaskOptions,
  type PredictedReason,
  type TaskPredictionView,
  type UserTaskDetail,
  type MyTaskSubmission,
} from "@/lib/vote/vote-task-contracts";
import styles from "./vote.module.css";

type VoteStep = 1 | 2 | 3 | 4;
type ReasonChoice =
  | Readonly<{ kind: "AI_ACCEPTED"; predictedReasonId: string }>
  | Readonly<{ kind: "USER_WRITTEN" }>
  | null;
type TaskOption = UserTaskDetail["task"]["question"]["options"][number];

const DIRECT_REASON_MAX_LENGTH = 500;
const COMPLETION_BURST_DOTS = [0, 1, 2, 3, 4, 5] as const;
const SUBMISSION_LOADING_DELAY_MS = 150;
const SUBMISSION_LOADING_MIN_VISIBLE_MS = 300;

export function VoteTaskScreen({ taskId }: { taskId: string }) {
  const queryClient = useQueryClient();
  const taskQuery = useOpenTaskQuery(taskId);
  const { predictionQuery, ensureMutation } = useTaskPredictionCoordinator(
    taskId,
    Boolean(taskQuery.data && !taskQuery.data.submission.submitted),
  );
  const submissionMutation = useSubmitTaskMutation(taskId);
  const [step, setStep] = useState<VoteStep>(1);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [reasonChoice, setReasonChoice] = useState<ReasonChoice>(null);
  const [directReason, setDirectReason] = useState("");
  const [directReasonError, setDirectReasonError] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [recoverableSubmission, setRecoverableSubmission] = useState<PendingTaskSubmission | null>(
    () => (typeof window === "undefined" ? null : readPendingTaskSubmission(taskId)),
  );
  const [cancelOpen, setCancelOpen] = useState(false);
  const taskDetail = taskQuery.data;
  const isViewingSubmittedResponse = Boolean(taskDetail?.submission.submitted && step === 1);
  const isRecoveringSubmission = Boolean(
    taskDetail && !taskDetail.submission.submitted && recoverableSubmission && step === 1,
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
  const selectedOption = options.find(({ id }) => id === selectedOptionId);
  const predictionView = predictionQuery.data;
  const participationReady = canStartTaskResponse(predictionView);
  const predictedReasons = getPredictedReasonsForOption(predictionView, selectedOptionId);
  const selectedPredictedReason = predictedReasons.find(
    (reason) =>
      reasonChoice?.kind === "AI_ACCEPTED" && reason.id === reasonChoice.predictedReasonId,
  );
  const directReasonAllowed = canWriteTaskReason(predictionView);
  const preparationMessage = getPredictionPreparationMessage({
    detail: taskDetail,
    view: predictionView,
    predictionError: predictionQuery.error,
    ensureError: ensureMutation.error,
    ensurePending: ensureMutation.isPending,
  });
  const trimmedDirectReason = directReason.trim();
  const directReasonLength = Array.from(trimmedDirectReason).length;
  const reasonReady = Boolean(
    selectedPredictedReason ||
    (reasonChoice?.kind === "USER_WRITTEN" &&
      trimmedDirectReason &&
      directReasonLength <= DIRECT_REASON_MAX_LENGTH),
  );
  const confirmationReason = selectedPredictedReason?.reason ?? trimmedDirectReason;

  useEffect(() => {
    if (taskDetail?.submission.submitted) clearPendingTaskSubmission(taskId);
  }, [taskDetail?.submission.submitted, taskId]);

  const backAction = useMemo<PlatformHeaderBackAction>(() => {
    if (step === 1) return { href: "/vote", ariaLabel: "투표 목록으로" };
    if (step === 2) return { onClick: () => setStep(1), ariaLabel: "투표 확인으로" };
    if (step === 3) return { onClick: () => setStep(2), ariaLabel: "응답 작성으로" };
    return { href: "/vote", ariaLabel: "투표 목록으로" };
  }, [step]);

  function chooseOption(optionId: string) {
    resetSubmissionAttempt();
    setSelectedOptionId((currentOptionId) => (currentOptionId === optionId ? null : optionId));
    setReasonChoice(null);
    setDirectReason("");
    setDirectReasonError(null);
  }

  function moveToConfirmation() {
    if (reasonChoice?.kind === "USER_WRITTEN" && !trimmedDirectReason) {
      setDirectReasonError("응답 이유를 입력해 주세요.");
      return;
    }
    if (
      reasonChoice?.kind === "USER_WRITTEN" &&
      Array.from(trimmedDirectReason).length > DIRECT_REASON_MAX_LENGTH
    ) {
      setDirectReasonError("응답 이유는 500자 이하로 입력해 주세요.");
      return;
    }
    if (selectedOptionId && reasonReady) setStep(3);
  }

  function resetSubmissionAttempt() {
    clearPendingTaskSubmission(taskId);
    setRecoverableSubmission(null);
    submissionMutation.reset();
    setSubmissionError(null);
  }

  async function submitResponse() {
    if (!taskDetail || !selectedOptionId || !reasonChoice || !reasonReady) return;
    if (!canStartTaskResponse(predictionView)) {
      setSubmissionError("과업 참여 준비가 완료되지 않았습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    try {
      const selection: VoteReasonSelection =
        reasonChoice.kind === "AI_ACCEPTED"
          ? reasonChoice
          : { kind: "USER_WRITTEN", reason: trimmedDirectReason };
      const command = createTaskSubmissionCommand({
        view: predictionView,
        questionId: taskDetail.task.question.id,
        selectedOptionId,
        selection,
      });
      const pending = getOrCreatePendingTaskSubmission(taskId, command);
      await submitPendingTask(pending);
    } catch (error) {
      setSubmissionError(getTaskSubmissionErrorMessage(error));
    }
  }

  async function submitPendingTask(pending: PendingTaskSubmission) {
    setSubmissionError(null);
    try {
      await submissionMutation.mutateAsync(pending);
      clearPendingTaskSubmission(taskId);
      setRecoverableSubmission(null);
      setStep(4);
    } catch (error) {
      if (error instanceof VoteApiError) {
        clearPendingTaskSubmission(taskId);
        setRecoverableSubmission(null);
        if (error.code === "TASK_ALREADY_SUBMITTED") {
          void queryClient.invalidateQueries({ queryKey: voteQueryKeys.tasks() });
          setStep(4);
          return;
        }
        if (
          error.code === "TASK_CURRENT_PERSONA_NOT_READY" ||
          error.code === "TASK_SUBMISSION_PERSONA_MISMATCH" ||
          error.code === "TASK_SUBMISSION_AI_ACCEPTANCE_NOT_AVAILABLE" ||
          error.code === "TASK_SUBMISSION_PREDICTION_REQUIRED" ||
          error.code === "TASK_SUBMISSION_PREDICTION_MISMATCH" ||
          error.code === "TASK_SUBMISSION_PREDICTION_UNAVAILABLE" ||
          error.code === "TASK_PREDICTED_REASON_NOT_FOUND" ||
          error.code === "TASK_SUBMISSION_REASON_OPTION_MISMATCH"
        ) {
          void predictionQuery.refetch();
        }
      } else {
        setRecoverableSubmission(pending);
      }
      setSubmissionError(getTaskSubmissionErrorMessage(error));
    }
  }

  function retryPredictionPreparation() {
    if (predictionQuery.isError) {
      void predictionQuery.refetch();
      return;
    }
    ensureMutation.mutate();
  }

  return (
    <PlatformShell
      bottomNavigation={<PlatformNavigationClient />}
      contentClassName={styles.voteContent!}
      contentInert={cancelOpen}
      header={
        <PlatformHeader
          backAction={backAction}
          className={styles.voteHeader!}
          leading={step === 4 ? null : undefined}
          title={isViewingSubmittedResponse ? "응답 보기" : "투표 참여하기"}
        />
      }
      overlay={cancelOpen ? <CancelSheet onClose={() => setCancelOpen(false)} /> : null}
    >
      <div className={`${styles.surface} ${styles.flowSurface}`} data-task-id={taskId}>
        {taskQuery.isPending ? <TaskFeedback message="과업을 불러오는 중입니다." /> : null}
        {taskQuery.isError ? (
          <TaskFeedback
            message={getTaskDetailErrorMessage(taskQuery.error)}
            onRetry={() => void taskQuery.refetch()}
          />
        ) : null}
        {taskDetail ? (
          <VoteProgress
            label={isViewingSubmittedResponse ? "응답 확인" : undefined}
            step={isViewingSubmittedResponse ? 4 : step}
          />
        ) : null}
        {taskDetail && isViewingSubmittedResponse && showSubmissionLoading ? (
          <TaskFeedback loading message="제출한 응답을 불러오는 중입니다." />
        ) : null}
        {taskDetail &&
        isViewingSubmittedResponse &&
        !showSubmissionLoading &&
        taskSubmissionQuery.isError ? (
          <TaskFeedback
            message={getTaskSubmissionViewErrorMessage(taskSubmissionQuery.error)}
            onRetry={() => void taskSubmissionQuery.refetch()}
          />
        ) : null}
        {taskDetail &&
        isViewingSubmittedResponse &&
        !showSubmissionLoading &&
        taskSubmissionQuery.data ? (
          <SubmittedTaskResponse detail={taskDetail} submission={taskSubmissionQuery.data} />
        ) : null}
        {taskDetail && isRecoveringSubmission && recoverableSubmission ? (
          <PendingSubmissionRecovery
            detail={taskDetail}
            errorMessage={submissionError}
            isSubmitting={submissionMutation.isPending}
            onDiscard={resetSubmissionAttempt}
            onRetry={() => void submitPendingTask(recoverableSubmission)}
            pending={recoverableSubmission}
            predictionView={predictionView}
          />
        ) : null}
        {taskDetail && !isViewingSubmittedResponse && !isRecoveringSubmission && step === 1 ? (
          <TaskOverview
            canContinue={participationReady}
            canRetryPreparation={predictionQuery.isError || ensureMutation.isError}
            detail={taskDetail}
            onContinue={() => setStep(2)}
            onRetryPreparation={retryPredictionPreparation}
            preparationMessage={preparationMessage}
          />
        ) : null}
        {taskDetail && step === 2 ? (
          <ResponseComposer
            allowDirectReason={directReasonAllowed}
            directReason={directReason}
            directReasonError={directReasonError}
            directReasonLength={directReasonLength}
            onCancel={() => setCancelOpen(true)}
            onChooseOption={chooseOption}
            onChooseReason={(choice) => {
              resetSubmissionAttempt();
              setReasonChoice((currentChoice) =>
                isSameReasonChoice(currentChoice, choice) ? null : choice,
              );
              setDirectReasonError(null);
            }}
            onDirectReasonChange={(value) => {
              resetSubmissionAttempt();
              setDirectReason(value);
              const length = Array.from(value.trim()).length;
              setDirectReasonError(
                length > DIRECT_REASON_MAX_LENGTH
                  ? "응답 이유는 500자 이하로 입력해 주세요."
                  : null,
              );
            }}
            onSubmit={moveToConfirmation}
            options={options}
            predictedReasons={predictedReasons}
            reasonChoice={reasonChoice}
            reasonReady={reasonReady}
            selectedOptionId={selectedOptionId}
          />
        ) : null}
        {taskDetail && step === 3 ? (
          <ResponseConfirmation
            errorMessage={submissionError}
            isSubmitting={submissionMutation.isPending}
            option={selectedOption?.content ?? ""}
            onSubmit={() => void submitResponse()}
            reason={confirmationReason}
          />
        ) : null}
        {taskDetail && step === 4 ? <VoteCompleted detail={taskDetail} /> : null}
      </div>
    </PlatformShell>
  );
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

function TaskFeedback({
  loading = false,
  message,
  onRetry,
}: {
  loading?: boolean;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      aria-busy={loading || undefined}
      aria-live="polite"
      className={styles.listFeedback}
      role={onRetry ? "alert" : "status"}
    >
      {loading ? <span aria-hidden="true" className={styles.loadingSpinner} /> : null}
      <p>{message}</p>
      {onRetry ? (
        <button className={styles.listRetryButton} onClick={onRetry} type="button">
          다시 시도
        </button>
      ) : null}
    </div>
  );
}

function getTaskDetailErrorMessage(error: unknown): string {
  if (error instanceof VoteApiError) {
    if (error.status === 401) return "로그인 후 투표에 참여할 수 있습니다.";
    if (error.status === 403) return "과업을 조회할 권한이 없습니다.";
    if (error.code === "TASK_NOT_FOUND") return "과업을 찾을 수 없습니다.";
    if (error.code === "TASK_CLOSED") return "마감된 투표입니다.";
  }
  return "과업을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

function getTaskSubmissionViewErrorMessage(error: unknown): string {
  if (error instanceof VoteApiError) {
    if (error.status === 401) return "로그인 후 제출한 응답을 확인할 수 있습니다.";
    if (error.status === 403) return "제출한 응답을 조회할 권한이 없습니다.";
    if (error.code === "TASK_SUBMISSION_NOT_FOUND") return "제출한 응답을 찾을 수 없습니다.";
  }
  return "제출한 응답을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

function getTaskSubmissionErrorMessage(error: unknown): string {
  if (error instanceof VoteApiError) {
    if (error.status === 401) return "로그인이 만료되었습니다. 다시 로그인해 주세요.";
    if (error.status === 403) return "과업을 제출할 권한이 없습니다.";
    if (error.code === "TASK_CURRENT_PERSONA_NOT_READY") {
      return "과업 참여 준비가 진행 중입니다. 잠시 후 다시 시도해 주세요.";
    }
    if (
      error.code === "TASK_SUBMISSION_PERSONA_MISMATCH" ||
      error.code === "TASK_SUBMISSION_AI_ACCEPTANCE_NOT_AVAILABLE" ||
      error.code === "TASK_SUBMISSION_PREDICTION_REQUIRED" ||
      error.code === "TASK_SUBMISSION_PREDICTION_MISMATCH" ||
      error.code === "TASK_SUBMISSION_PREDICTION_UNAVAILABLE" ||
      error.code === "TASK_PREDICTED_REASON_NOT_FOUND" ||
      error.code === "TASK_SUBMISSION_REASON_OPTION_MISMATCH"
    ) {
      return "과업 참여 정보가 변경되었습니다. 준비가 완료된 뒤 다시 제출해 주세요.";
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
    if (error.code === "IDEMPOTENCY_CONFLICT") {
      return "제출 내용을 다시 확인한 뒤 재시도해 주세요.";
    }
  }
  return "제출 결과를 확인하지 못했습니다. 같은 내용으로 다시 시도해 주세요.";
}

function isSameReasonChoice(left: ReasonChoice, right: NonNullable<ReasonChoice>): boolean {
  if (!left || left.kind !== right.kind) return false;
  if (left.kind === "USER_WRITTEN") return true;
  return right.kind === "AI_ACCEPTED" && left.predictedReasonId === right.predictedReasonId;
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
  if (!view || ensurePending || view.state === "PERSONA_NOT_READY" || !view.predictionId) {
    return "과업 참여를 준비하는 중입니다.";
  }
  if (!canStartTaskResponse(view)) return "현재 응답을 작성할 수 없습니다.";
  return null;
}

function VoteProgress({ step, label }: { step: VoteStep; label?: string | undefined }) {
  const labels: Record<VoteStep, string> = {
    1: "투표 확인",
    2: "응답 작성",
    3: "응답 확인",
    4: "참여 완료",
  };
  return (
    <div className={styles.progressBlock}>
      <p className={styles.progressLabel}>
        <span>{step}/4</span>
        <strong>{label ?? labels[step]}</strong>
      </p>
      <div aria-label={`진행 단계 ${step}/4`} className={styles.progressBars}>
        {[1, 2, 3, 4].map((segment) => {
          const state = segment < step ? "done" : segment === step ? "current" : "upcoming";
          return (
            <span
              aria-current={state === "current" ? "step" : undefined}
              className={styles.progressBar}
              data-state={state}
              key={segment}
            />
          );
        })}
      </div>
    </div>
  );
}

function TaskOverview({
  canContinue,
  canRetryPreparation,
  detail,
  onContinue,
  onRetryPreparation,
  preparationMessage,
}: {
  canContinue: boolean;
  canRetryPreparation: boolean;
  detail: UserTaskDetail;
  onContinue: () => void;
  onRetryPreparation: () => void;
  preparationMessage: string | null;
}) {
  const options = sortTaskOptions(detail.task.question.options);
  return (
    <div className={styles.flowBody}>
      <section className={styles.flowSection}>
        <h2 className={styles.sectionTitle}>주제</h2>
        <dl className={styles.infoCard}>
          <InfoRow label="배경" value={detail.task.description ?? detail.task.title} />
          <InfoRow label="질문" value={detail.task.question.content} />
          <InfoRow label="마감" value={formatVoteDateTime(detail.closesAt)} />
        </dl>
      </section>
      <section className={styles.flowSection}>
        <h2 className={styles.sectionTitle}>응답 선택지</h2>
        <div className={styles.overviewOptions}>
          {options.map((option) => (
            <div className={styles.overviewOption} key={option.id}>
              <span>응답 선택지 {option.displayOrder}</span>
              <strong>{option.content}</strong>
            </div>
          ))}
        </div>
      </section>
      {preparationMessage ? (
        <p aria-live="polite" className={styles.predictionNotice}>
          {preparationMessage}
        </p>
      ) : null}
      <button
        className={`${styles.compactPrimaryButton} ${styles.overviewContinueButton}`}
        disabled={!canContinue && !canRetryPreparation}
        onClick={canRetryPreparation ? onRetryPreparation : onContinue}
        type="button"
      >
        {canRetryPreparation ? "다시 시도" : canContinue ? "참여하기" : "준비 중…"}
      </button>
    </div>
  );
}

function PendingSubmissionRecovery({
  detail,
  errorMessage,
  isSubmitting,
  onDiscard,
  onRetry,
  pending,
  predictionView,
}: {
  detail: UserTaskDetail;
  errorMessage: string | null;
  isSubmitting: boolean;
  onDiscard: () => void;
  onRetry: () => void;
  pending: PendingTaskSubmission;
  predictionView: TaskPredictionView | undefined;
}) {
  const selectedOption = sortTaskOptions(detail.task.question.options).find(
    (option) => option.id === pending.command.selectedOptionId,
  );
  let reason: string;
  if (pending.command.reasonSource === "USER_WRITTEN") {
    reason = pending.command.reason;
  } else {
    const acceptedReasonId = pending.command.acceptedPredictedReasonId;
    reason =
      predictionView?.predictedReasons.find((item) => item.id === acceptedReasonId)?.reason ??
      "AI 예상 이유를 선택한 응답입니다.";
  }

  return (
    <div className={styles.flowBody}>
      <section className={styles.recoveryPanel}>
        <h2>제출 확인이 필요합니다.</h2>
        <p>
          이전 제출의 처리 결과를 확인하지 못했습니다. 자동으로 다시 보내지 않으니 아래 내용을
          확인해 주세요.
        </p>
      </section>
      <dl className={styles.infoCard}>
        <InfoRow
          label="선택한 선택지"
          value={selectedOption?.content ?? "선택한 응답을 확인할 수 없습니다."}
        />
        <InfoRow label="제출할 이유" value={reason} />
      </dl>
      {errorMessage ? (
        <p aria-live="polite" className={styles.submissionError} role="alert">
          {errorMessage}
        </p>
      ) : null}
      <div className={styles.fullActions}>
        <button
          aria-busy={isSubmitting}
          className={styles.fullPrimaryButton}
          disabled={isSubmitting}
          onClick={onRetry}
          type="button"
        >
          {isSubmitting ? "다시 제출 중…" : "같은 응답 다시 제출"}
        </button>
        <button
          className={styles.fullSecondaryButton}
          disabled={isSubmitting}
          onClick={onDiscard}
          type="button"
        >
          새로 작성
        </button>
      </div>
    </div>
  );
}

function SubmittedTaskResponse({
  detail,
  submission,
}: {
  detail: UserTaskDetail;
  submission: MyTaskSubmission;
}) {
  const selectedOption = sortTaskOptions(submission.question.options).find(
    (option) => option.id === submission.selectedOptionId,
  );

  return (
    <div className={styles.flowBody}>
      <section className={styles.flowSection}>
        <h2 className={styles.sectionTitle}>과업</h2>
        <dl className={styles.infoCard}>
          <InfoRow label="배경" value={detail.task.description ?? detail.task.title} />
          <InfoRow label="질문" value={detail.task.question.content} />
          <InfoRow label="마감" value={formatVoteDateTime(detail.closesAt)} />
        </dl>
      </section>
      <section className={styles.flowSection}>
        <h2 className={styles.sectionTitle}>내 응답</h2>
        <dl className={styles.infoCard}>
          <InfoRow
            label="내가 선택한 선택지"
            value={selectedOption?.content ?? "선택한 응답을 확인할 수 없습니다."}
          />
          <InfoRow label="내가 제출한 이유" value={submission.finalReason} />
          <InfoRow label="제출 시각" value={formatVoteDateTime(submission.submittedAt)} />
        </dl>
      </section>
      <Link
        className={`${styles.compactPrimaryButton} ${styles.overviewContinueButton}`}
        href="/vote"
      >
        과업 목록으로
      </Link>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.infoRow}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

type ComposerProps = Readonly<{
  allowDirectReason: boolean;
  directReason: string;
  directReasonError: string | null;
  directReasonLength: number;
  onCancel: () => void;
  onChooseOption: (optionId: string) => void;
  onChooseReason: (choice: NonNullable<ReasonChoice>) => void;
  onDirectReasonChange: (value: string) => void;
  onSubmit: () => void;
  options: TaskOption[];
  predictedReasons: PredictedReason[];
  reasonChoice: ReasonChoice;
  reasonReady: boolean;
  selectedOptionId: string | null;
}>;

function ResponseComposer(props: ComposerProps) {
  const hasSelectedOption = Boolean(props.selectedOptionId);

  return (
    <div className={styles.flowBody}>
      <div className={styles.responseComposerSections}>
        <section className={styles.flowSection}>
          <h2 className={styles.sectionTitle}>응답 선택지</h2>
          <div className={styles.choiceGrid}>
            {props.options.map((option) => (
              <button
                aria-pressed={props.selectedOptionId === option.id}
                className={styles.choiceCard}
                key={option.id}
                onClick={() => props.onChooseOption(option.id)}
                type="button"
              >
                <span>응답 선택지 {option.displayOrder}</span>
                <strong>{option.content}</strong>
              </button>
            ))}
          </div>
        </section>
        <div
          aria-hidden={!hasSelectedOption}
          className={styles.reasonTitleDisclosure}
          data-visible={hasSelectedOption}
          inert={!hasSelectedOption}
        >
          <div className={styles.reasonTitleDisclosureInner}>
            <h2 className={styles.sectionTitle}>응답 이유</h2>
          </div>
        </div>
        <div
          aria-hidden={!hasSelectedOption}
          className={styles.reasonAccordion}
          data-open={hasSelectedOption}
          data-phase={hasSelectedOption ? "open" : "closed"}
          inert={!hasSelectedOption}
        >
          <div className={styles.reasonAccordionInner}>
            <div className={styles.reasonList}>
              {props.predictedReasons.map((reason) => (
                <button
                  aria-pressed={
                    props.reasonChoice?.kind === "AI_ACCEPTED" &&
                    props.reasonChoice.predictedReasonId === reason.id
                  }
                  className={styles.reasonCard}
                  key={reason.id}
                  onClick={() =>
                    props.onChooseReason({ kind: "AI_ACCEPTED", predictedReasonId: reason.id })
                  }
                  type="button"
                >
                  <span>AI 예상 이유 {reason.reasonOrder}</span>
                  <strong>{reason.reason}</strong>
                </button>
              ))}
              {props.allowDirectReason ? (
                <div
                  className={styles.directReasonCard}
                  data-selected={props.reasonChoice?.kind === "USER_WRITTEN"}
                >
                  <button
                    aria-pressed={props.reasonChoice?.kind === "USER_WRITTEN"}
                    className={styles.directReasonSelect}
                    onClick={() => props.onChooseReason({ kind: "USER_WRITTEN" })}
                    type="button"
                  >
                    <span>직접 입력</span>
                    <strong>나의 생각을 직접 작성합니다.</strong>
                  </button>
                  <div
                    aria-hidden={props.reasonChoice?.kind !== "USER_WRITTEN"}
                    className={styles.directInputDisclosure}
                    data-open={props.reasonChoice?.kind === "USER_WRITTEN"}
                    inert={props.reasonChoice?.kind !== "USER_WRITTEN"}
                  >
                    <div className={styles.directInputDisclosureInner}>
                      <div className={styles.directInputWrap}>
                        <textarea
                          aria-label="응답 이유"
                          aria-invalid={Boolean(props.directReasonError)}
                          className={styles.directTextarea}
                          onChange={(event) => props.onDirectReasonChange(event.target.value)}
                          placeholder="응답 이유를 입력하세요…"
                          value={props.directReason}
                        />
                        <div className={styles.directFieldMeta}>
                          <span className={styles.directFieldHint}>
                            {props.directReasonLength}/{DIRECT_REASON_MAX_LENGTH}자
                          </span>
                          {props.directReasonError ? (
                            <span className={styles.fieldError}>{props.directReasonError}</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      <div className={styles.fullActions}>
        <button
          className={styles.fullPrimaryButton}
          disabled={!props.reasonReady}
          onClick={props.onSubmit}
          type="button"
        >
          확인하기
        </button>
        <button className={styles.fullSecondaryButton} onClick={props.onCancel} type="button">
          나가기
        </button>
      </div>
    </div>
  );
}

function ResponseConfirmation({
  errorMessage,
  isSubmitting,
  option,
  onSubmit,
  reason,
}: {
  errorMessage: string | null;
  isSubmitting: boolean;
  option: string;
  onSubmit: () => void;
  reason: string;
}) {
  return (
    <div className={styles.flowBody}>
      <section className={styles.confirmCard}>
        <span>응답 선택지</span>
        <strong>{option}</strong>
      </section>
      <section className={styles.confirmCard}>
        <span>응답 이유</span>
        <strong>{reason}</strong>
      </section>
      <p className={styles.confirmNotice}>
        제출한 응답은 수정할 수 없습니다. 내용을 다시 한번 확인해 주세요.
      </p>
      {errorMessage ? (
        <p aria-live="polite" className={styles.submissionError} role="alert">
          {errorMessage}
        </p>
      ) : null}
      <button
        aria-busy={isSubmitting}
        className={`${styles.compactPrimaryButton} ${styles.confirmationSubmitButton}`}
        disabled={isSubmitting}
        onClick={onSubmit}
        type="button"
      >
        {isSubmitting ? "제출 중…" : "제출하기"}
      </button>
    </div>
  );
}

function VoteCompleted({ detail }: { detail: UserTaskDetail }) {
  return (
    <div className={`${styles.flowBody} ${styles.completionBody}`}>
      <div className={styles.successPanel}>
        <span aria-hidden="true" className={styles.successCelebration}>
          <span className={styles.successIcon} />
          {COMPLETION_BURST_DOTS.map((dot) => (
            <span className={styles.successBurstDot} key={dot} />
          ))}
        </span>
        <strong>투표 참여가 완료되었습니다.</strong>
      </div>
      <dl className={`${styles.infoCard} ${styles.completionInfoCard}`}>
        <InfoRow label="배경" value={detail.task.description ?? detail.task.title} />
        <InfoRow label="질문" value={detail.task.question.content} />
      </dl>
      <Link className={`${styles.compactPrimaryButton} ${styles.completionAction}`} href="/vote">
        과업 목록으로
      </Link>
    </div>
  );
}

function CancelSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className={styles.cancelOverlay}>
      <button
        aria-label="취소 창 닫기"
        className={styles.cancelBackdrop}
        onClick={onClose}
        type="button"
      />
      <section
        aria-labelledby="vote-cancel-title"
        aria-modal="true"
        className={styles.cancelSheet}
        role="dialog"
      >
        <div className={styles.cancelSheetHeader}>
          <h2 id="vote-cancel-title">투표를 종료할까요?</h2>
          <button
            aria-label="닫기"
            className={styles.cancelClose}
            onClick={onClose}
            type="button"
          />
        </div>
        <p>현재 작성 내용은 저장되지 않습니다.</p>
        <div className={styles.cancelActions}>
          <Link className={styles.fullSecondaryButton} href="/vote">
            저장하지 않고 나가기
          </Link>
          <button className={styles.fullPrimaryButton} onClick={onClose} type="button">
            이어서 투표하기
          </button>
        </div>
      </section>
    </div>
  );
}
