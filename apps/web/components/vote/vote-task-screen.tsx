"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
} from "@/lib/vote/vote-idempotent-submission";
import {
  useOpenTaskQuery,
  useSubmitTaskMutation,
  useTaskPredictionCoordinator,
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
} from "@/lib/vote/vote-task-contracts";
import styles from "./vote.module.css";

type VoteStep = 1 | 2 | 3 | 4;
type ReasonChoice =
  | Readonly<{ kind: "AI_ACCEPTED"; predictedReasonId: string }>
  | Readonly<{ kind: "USER_WRITTEN" }>
  | null;
type TaskOption = UserTaskDetail["task"]["question"]["options"][number];

const DIRECT_REASON_MAX_LENGTH = 500;

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
  const [cancelOpen, setCancelOpen] = useState(false);
  const taskDetail = taskQuery.data;
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
  const reasonReady = Boolean(
    selectedPredictedReason || (reasonChoice?.kind === "USER_WRITTEN" && trimmedDirectReason),
  );
  const confirmationReason = selectedPredictedReason?.reason ?? trimmedDirectReason;

  const backAction = useMemo<PlatformHeaderBackAction>(() => {
    if (step === 1) return { href: "/vote", ariaLabel: "투표 목록으로" };
    if (step === 2) return { onClick: () => setStep(1), ariaLabel: "과업 확인으로" };
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
    submissionMutation.reset();
    setSubmissionError(null);
  }

  async function submitResponse() {
    if (!taskDetail || !selectedOptionId || !reasonChoice || !reasonReady) return;
    if (!canStartTaskResponse(predictionView)) {
      setSubmissionError("과업 참여 준비가 완료되지 않았습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    setSubmissionError(null);
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
      await submissionMutation.mutateAsync(pending);
      clearPendingTaskSubmission(taskId);
      setStep(4);
    } catch (error) {
      if (error instanceof VoteApiError) {
        clearPendingTaskSubmission(taskId);
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
      }
      setSubmissionError(getTaskSubmissionErrorMessage(error));
    }
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
          title="투표 참여하기"
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
        {taskDetail ? <VoteProgress step={step} /> : null}
        {taskDetail && step === 1 ? (
          <TaskOverview
            canContinue={participationReady}
            detail={taskDetail}
            onContinue={() => setStep(2)}
            preparationMessage={preparationMessage}
          />
        ) : null}
        {taskDetail && step === 2 ? (
          <ResponseComposer
            allowDirectReason={directReasonAllowed}
            directReason={directReason}
            directReasonError={directReasonError}
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
              if (value.trim()) setDirectReasonError(null);
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

function TaskFeedback({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div aria-live="polite" className={styles.listFeedback} role={onRetry ? "alert" : "status"}>
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
    if (error.status === 401) return "로그인 후 과업에 참여할 수 있습니다.";
    if (error.status === 403) return "과업을 조회할 권한이 없습니다.";
    if (error.code === "TASK_NOT_FOUND") return "과업을 찾을 수 없습니다.";
    if (error.code === "TASK_CLOSED") return "마감된 과업입니다.";
  }
  return "과업을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
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
  if (detail?.submission.submitted) return "이미 참여 완료한 과업입니다.";
  if (predictionError || ensureError) {
    return "과업 참여 정보를 준비하지 못했습니다. 잠시 후 다시 접속해 주세요.";
  }
  if (!view || ensurePending || view.state === "PERSONA_NOT_READY" || !view.predictionId) {
    return "과업 참여를 준비하는 중입니다.";
  }
  if (!canStartTaskResponse(view)) return "현재 응답을 작성할 수 없습니다.";
  return null;
}

function VoteProgress({ step }: { step: VoteStep }) {
  const labels: Record<VoteStep, string> = {
    1: "과업 확인",
    2: "응답 작성",
    3: "응답 확인",
    4: "참여 완료",
  };
  return (
    <div className={styles.progressBlock}>
      <p className={styles.progressLabel}>
        <span>{step}/4</span>
        <strong>{labels[step]}</strong>
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
  detail,
  onContinue,
  preparationMessage,
}: {
  canContinue: boolean;
  detail: UserTaskDetail;
  onContinue: () => void;
  preparationMessage: string | null;
}) {
  const options = sortTaskOptions(detail.task.question.options);
  return (
    <div className={styles.flowBody}>
      <section className={styles.flowSection}>
        <h2 className={styles.sectionTitle}>과업</h2>
        <dl className={styles.infoCard}>
          <InfoRow label="배경" value={detail.task.description ?? detail.task.title} />
          <InfoRow label="질의" value={detail.task.question.content} />
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
        disabled={!canContinue}
        onClick={onContinue}
        type="button"
      >
        {canContinue ? "참여하기" : "준비 중…"}
      </button>
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
                          <span className={styles.directFieldHint}>1~500자</span>
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
          disabled={!props.reasonChoice}
          onClick={props.onSubmit}
          type="button"
        >
          제출하기
        </button>
        <button className={styles.fullSecondaryButton} onClick={props.onCancel} type="button">
          참여 취소하기
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
        className={styles.compactPrimaryButton}
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
    <div className={styles.flowBody}>
      <div className={styles.successPanel}>
        <span aria-hidden="true" className={styles.successIcon} />
        <strong>투표 참여가 완료되었습니다.</strong>
      </div>
      <dl className={styles.infoCard}>
        <InfoRow label="배경" value={detail.task.description ?? detail.task.title} />
        <InfoRow label="질의" value={detail.task.question.content} />
      </dl>
      <Link className={styles.compactPrimaryButton} href="/vote">
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
        <p>저장하지 않고 나가면 현재 작성 내용이 사라집니다.</p>
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
