"use client";

import Link from "next/link";
import { PlatformNavigationClient } from "@/components/platform-navigation-client";
import {
  PlatformHeader,
  PlatformShell,
  type PlatformHeaderBackAction,
} from "@/components/platform-shell";
import { VoteApiError } from "@/lib/vote/vote-fetch";
import { formatVoteDateTime } from "@/lib/vote/vote-format";
import type { PendingTaskSubmission } from "@/lib/vote/vote-idempotent-submission";
import {
  hasLongVoteOptionContent,
  isLongVoteOptionContent,
} from "@/lib/vote/vote-option-presentation";
import {
  sortTaskOptions,
  type PredictedReason,
  type TaskPredictionView,
  type UserTaskDetail,
  type MyTaskSubmission,
} from "@/lib/vote/vote-task-contracts";
import { useVoteTaskController } from "./use-vote-task-controller";
import { VoteTaskScreenLoading } from "./vote-task-screen-loading";
import { DIRECT_REASON_MAX_LENGTH, type ReasonChoice, type VoteStep } from "./vote-task-flow";
import styles from "./vote.module.css";

type TaskOption = UserTaskDetail["task"]["question"]["options"][number];

const COMPLETION_BURST_DOTS = [0, 1, 2, 3, 4, 5] as const;

export function VoteTaskScreen({ taskId }: { taskId: string }) {
  const { actions, model } = useVoteTaskController(taskId);
  const backAction: PlatformHeaderBackAction =
    model.step === 1
      ? { href: "/vote", ariaLabel: "투표 목록으로" }
      : model.step === 2
        ? { onClick: () => actions.goToStep(1), ariaLabel: "투표 확인으로" }
        : model.step === 3
          ? { onClick: () => actions.goToStep(2), ariaLabel: "응답 작성으로" }
          : { href: "/vote", ariaLabel: "투표 목록으로" };

  if (model.taskIsPending) {
    return <VoteTaskScreenLoading />;
  }

  return (
    <PlatformShell
      bottomNavigation={<PlatformNavigationClient />}
      contentClassName={styles.voteContent!}
      contentInert={model.cancelOpen}
      header={
        <PlatformHeader
          backAction={backAction}
          className={styles.voteHeader!}
          leading={model.step === 4 ? null : undefined}
          title={model.isViewingSubmittedResponse ? "제출 완료" : "투표 참여하기"}
        />
      }
      headerSize="compact"
      overlay={model.cancelOpen ? <CancelSheet onClose={actions.closeCancel} /> : null}
    >
      <div className={`${styles.surface} ${styles.flowSurface}`} data-task-id={taskId}>
        {model.taskIsError ? (
          <TaskFeedback
            message={getTaskDetailErrorMessage(model.taskError)}
            onRetry={actions.retryTaskLoad}
          />
        ) : null}
        {model.taskDetail && !model.isViewingSubmittedResponse ? (
          <VoteProgress step={model.step} />
        ) : null}
        {model.taskDetail && model.isViewingSubmittedResponse && model.showSubmissionLoading ? (
          <TaskFeedback loading message="제출한 응답을 불러오는 중입니다." />
        ) : null}
        {model.taskDetail &&
        model.isViewingSubmittedResponse &&
        !model.showSubmissionLoading &&
        model.taskSubmissionIsError ? (
          <TaskFeedback
            message={getTaskSubmissionViewErrorMessage(model.taskSubmissionError)}
            onRetry={actions.retrySubmissionView}
          />
        ) : null}
        {model.taskDetail &&
        model.isViewingSubmittedResponse &&
        !model.showSubmissionLoading &&
        model.taskSubmission ? (
          <SubmittedTaskResponse detail={model.taskDetail} submission={model.taskSubmission} />
        ) : null}
        {model.taskDetail && model.isRecoveringSubmission && model.recoverableSubmission ? (
          <PendingSubmissionRecovery
            detail={model.taskDetail}
            errorMessage={model.submissionError}
            isSubmitting={model.isSubmitting}
            onDiscard={actions.discardPendingSubmission}
            onRetry={actions.retryPendingSubmission}
            pending={model.recoverableSubmission}
            predictionView={model.predictionView}
          />
        ) : null}
        {model.taskDetail &&
        !model.isViewingSubmittedResponse &&
        !model.isRecoveringSubmission &&
        model.step === 1 ? (
          <TaskOverview
            canContinue={model.participationReady}
            canRetryPreparation={model.canRetryPreparation}
            detail={model.taskDetail}
            onContinue={() => actions.goToStep(2)}
            onRetryPreparation={actions.retryPredictionPreparation}
            preparationLoading={model.predictionPreparationLoading}
            preparationMessage={model.preparationMessage}
            showParticipationAction={model.showParticipationAction}
          />
        ) : null}
        {model.taskDetail && model.step === 2 ? (
          <ResponseComposer
            allowDirectReason={model.directReasonAllowed}
            directReason={model.directReason}
            directReasonError={model.directReasonError}
            directReasonLength={model.directReasonLength}
            onCancel={actions.openCancel}
            onChooseOption={actions.chooseOption}
            onChooseReason={actions.chooseReason}
            onDirectReasonChange={actions.changeDirectReason}
            onSubmit={actions.moveToConfirmation}
            options={model.options}
            predictedReasons={model.predictedReasons}
            reasonChoice={model.reasonChoice}
            reasonReady={model.reasonReady}
            selectedOptionId={model.selectedOptionId}
          />
        ) : null}
        {model.taskDetail && model.step === 3 ? (
          <ResponseConfirmation
            canSubmit={model.participationReady}
            errorMessage={model.submissionError}
            isSubmitting={model.isSubmitting}
            option={model.selectedOption?.content ?? ""}
            onSubmit={actions.submitResponse}
            reason={model.confirmationReason}
          />
        ) : null}
        {model.taskDetail && model.step === 4 ? <VoteCompleted detail={model.taskDetail} /> : null}
      </div>
    </PlatformShell>
  );
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

function VoteProgress({ step }: { step: VoteStep }) {
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
  canRetryPreparation,
  detail,
  onContinue,
  onRetryPreparation,
  preparationLoading,
  preparationMessage,
  showParticipationAction,
}: {
  canContinue: boolean;
  canRetryPreparation: boolean;
  detail: UserTaskDetail;
  onContinue: () => void;
  onRetryPreparation: () => void;
  preparationLoading: boolean;
  preparationMessage: string | null;
  showParticipationAction: boolean;
}) {
  const options = sortTaskOptions(detail.task.question.options);
  return (
    <div className={styles.flowBody}>
      <section className={styles.flowSection}>
        <h2 className={styles.sectionTitle}>주제</h2>
        <dl className={`${styles.infoCard} ${styles.overviewInfoCard}`}>
          <InfoRow label="배경" value={detail.task.description ?? detail.task.title} />
          <InfoRow field="question" label="질문" value={detail.task.question.content} />
          <InfoRow label="마감" value={formatVoteDateTime(detail.closesAt)} />
        </dl>
      </section>
      <section className={styles.flowSection}>
        <h2 className={styles.sectionTitle}>응답 선택지</h2>
        <div className={styles.overviewOptions}>
          {options.map((option) => (
            <div className={styles.overviewOption} key={option.id}>
              <span>응답 선택지 {option.displayOrder}</span>
              <strong
                className={isLongVoteOptionContent(option.content) ? styles.longOptionContent : ""}
              >
                {option.content}
              </strong>
            </div>
          ))}
        </div>
      </section>
      {preparationMessage || preparationLoading ? (
        <p
          aria-busy={preparationLoading || undefined}
          aria-live="polite"
          className={`${styles.predictionNotice} ${preparationLoading ? styles.predictionNoticeLoading : ""}`}
        >
          {preparationLoading ? (
            <span aria-hidden="true" className={styles.loadingSpinner} />
          ) : null}
          {preparationMessage ? <span>{preparationMessage}</span> : null}
        </p>
      ) : null}
      {showParticipationAction ? (
        <button
          className={`${styles.compactPrimaryButton} ${styles.overviewContinueButton}`}
          disabled={!canContinue && !canRetryPreparation}
          onClick={canRetryPreparation ? onRetryPreparation : onContinue}
          type="button"
        >
          {canRetryPreparation ? "다시 시도" : canContinue ? "참여하기" : "준비 중…"}
        </button>
      ) : null}
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
    const acceptedReasonId = pending.command.predictedReasonId;
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
        <h2 className={styles.sectionTitle}>주제</h2>
        <dl className={styles.infoCard}>
          <InfoRow label="배경" value={detail.task.description ?? detail.task.title} />
          <InfoRow label="질문" value={detail.task.question.content} />
          <InfoRow label="마감" value={formatVoteDateTime(detail.closesAt)} />
        </dl>
      </section>
      <section className={styles.flowSection}>
        <h2 className={styles.sectionTitle}>내 제출</h2>
        <dl className={styles.infoCard}>
          <InfoRow
            label="선택지"
            value={selectedOption?.content ?? "선택한 응답을 확인할 수 없습니다."}
          />
          <InfoRow label="이유" value={submission.finalReason} />
          <InfoRow label="제출 시각" value={formatVoteDateTime(submission.submittedAt)} />
        </dl>
      </section>
      <Link
        className={`${styles.compactPrimaryButton} ${styles.overviewContinueButton}`}
        href="/vote"
      >
        돌아가기
      </Link>
    </div>
  );
}

function InfoRow({ field, label, value }: { field?: "question"; label: string; value: string }) {
  return (
    <div className={styles.infoRow} data-info-row={field}>
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
  const useOptionListLayout = hasLongVoteOptionContent(props.options);

  return (
    <div className={styles.flowBody}>
      <div className={styles.responseComposerSections}>
        <section className={styles.flowSection}>
          <h2 className={styles.sectionTitle}>응답 선택지</h2>
          <div
            className={`${styles.choiceGrid} ${useOptionListLayout ? styles.choiceList : ""}`}
            data-choice-layout={useOptionListLayout ? "list" : "grid"}
          >
            {props.options.map((option) => (
              <button
                aria-pressed={props.selectedOptionId === option.id}
                className={styles.choiceCard}
                key={option.id}
                onClick={() => props.onChooseOption(option.id)}
                type="button"
              >
                <span>응답 선택지 {option.displayOrder}</span>
                <strong
                  className={
                    isLongVoteOptionContent(option.content) ? styles.longOptionContent : ""
                  }
                >
                  {option.content}
                </strong>
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
                            {props.directReasonLength} / {DIRECT_REASON_MAX_LENGTH}자
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
          제출하기
        </button>
        <button className={styles.fullSecondaryButton} onClick={props.onCancel} type="button">
          나가기
        </button>
      </div>
    </div>
  );
}

function ResponseConfirmation({
  canSubmit,
  errorMessage,
  isSubmitting,
  option,
  onSubmit,
  reason,
}: {
  canSubmit: boolean;
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
      <p className={styles.confirmNotice}>제출 후에는 선택지와 이유를 수정할 수 없습니다.</p>
      {errorMessage ? (
        <p aria-live="polite" className={styles.submissionError} role="alert">
          {errorMessage}
        </p>
      ) : null}
      <button
        aria-busy={isSubmitting}
        className={styles.fullPrimaryButton}
        disabled={isSubmitting || !canSubmit}
        onClick={onSubmit}
        type="button"
      >
        {isSubmitting ? "확인 중…" : "확인하기"}
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
        <div className={styles.successCopy}>
          <strong>투표 참여가 완료되었습니다.</strong>
          <p>소중한 의견을 나눠주셔서 감사합니다.</p>
        </div>
      </div>
      <dl className={`${styles.infoCard} ${styles.completionInfoCard}`}>
        <InfoRow label="배경" value={detail.task.description ?? detail.task.title} />
        <InfoRow label="질문" value={detail.task.question.content} />
      </dl>
      <Link className={`${styles.compactPrimaryButton} ${styles.completionAction}`} href="/vote">
        목록으로
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
