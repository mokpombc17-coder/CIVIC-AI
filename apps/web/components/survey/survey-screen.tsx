"use client";

import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
  type UIEvent,
} from "react";
import {
  PlatformHeader,
  PlatformShell,
  type PlatformHeaderBackAction,
} from "@/components/platform-shell";
import { useAcceptSensitiveSurveyConsentMutation } from "@/lib/consent/consent-queries";
import {
  getFeatureFailureDetails,
  type FeatureFailureAnalyticsSession,
} from "@/lib/analytics/feature-failure-analytics";
import type { SubmissionResponse, SurveySection } from "@/lib/survey/survey-contracts";
import {
  validateSurvey,
  validateSurveySection,
  type SurveyAnswerDraft,
} from "@/lib/survey/survey-answer-state";
import { useCurrentSurveyQuery, useSubmitSurveyMutation } from "@/lib/survey/survey-queries";
import { removeSurveyDraft, resolveSurveyDraftOwnerKey } from "@/lib/survey/survey-draft-storage";
import { SurveySubmissionCoordinator } from "@/lib/survey/survey-submission-coordinator";
import {
  classifySubmissionFailure,
  findFirstInvalidSurveySectionIndex,
} from "@/lib/survey/survey-submission-recovery";
import { VoteApiError } from "@/lib/vote/vote-fetch";
import {
  SurveyFlowLayout,
  SurveyHeaderProgress,
  SurveyProgress,
  SurveyStepActions,
  SurveyStepCard,
  shouldShowSurveyHeaderProgress,
} from "./survey-flow";
import { SurveyLoadingStatus } from "./survey-loading";
import { SurveyStatus } from "./survey-status";
import { SurveySubmissionCompletion } from "./survey-submission-completion";
import { createInitialSurveyFormState, reduceSurveyFormState } from "./survey-form-state";
import { SurveySectionFields } from "./survey-question-fields";
import { useSurveyDraftSession } from "./use-survey-draft-session";
import { useFeatureFailureAnalytics } from "../use-feature-failure-analytics";
import { useSurveyParticipationAnalytics } from "./use-survey-participation-analytics";
import styles from "./survey.module.css";

const CONFIRMATION_STEP_TITLE = "필수 동의·확인";
const CONFIRMATION_CARD_TITLE = "필수 동의 항목";
const HOUSEHOLD_SECTION_KEY = "household-information";
const SENSITIVE_INFORMATION_CONSENT = {
  documentCode: "SENSITIVE_INFORMATION_CONSENT",
  documentVersion: "2026-09-04",
} as const;

type SurveyHeaderProgressState = Readonly<{
  currentStep: number;
  totalSteps: number;
}>;

export function SurveyScreen({ returnTo }: { returnTo: string }) {
  const surveyQuery = useCurrentSurveyQuery();
  const failureAnalytics = useFeatureFailureAnalytics("survey", "participation");
  const [headerBackAction, setHeaderBackAction] = useState<PlatformHeaderBackAction | null>(null);
  const [headerProgress, setHeaderProgress] = useState<SurveyHeaderProgressState | null>(null);
  const [submissionResult, setSubmissionResult] = useState<SubmissionResponse | null>(null);
  const updateHeaderBackAction = useCallback((action: PlatformHeaderBackAction | null) => {
    setHeaderBackAction(action);
  }, []);
  const updateHeaderProgress = useCallback((progress: SurveyHeaderProgressState | null) => {
    setHeaderProgress(progress);
  }, []);
  const handleSubmitted = useCallback((result: SubmissionResponse) => {
    setHeaderBackAction(null);
    setHeaderProgress(null);
    setSubmissionResult(result);
  }, []);

  useEffect(() => {
    if (surveyQuery.isError) {
      if (
        surveyQuery.error instanceof VoteApiError &&
        surveyQuery.error.code === "SURVEY_ACTIVE_ROUND_UNAVAILABLE"
      ) {
        return;
      }
      failureAnalytics.trackFailure({
        ...getFeatureFailureDetails(surveyQuery.error, "api", "survey_load_failed"),
        incidentKey: "screen-load",
        operation: "screen_load",
        retryCount: Math.max(0, surveyQuery.failureCount - 1),
        surface: "participation",
      });
      return;
    }
    if (surveyQuery.isSuccess) failureAnalytics.trackRecovered("screen-load");
  }, [
    failureAnalytics,
    surveyQuery.error,
    surveyQuery.failureCount,
    surveyQuery.isError,
    surveyQuery.isSuccess,
  ]);

  useEffect(() => {
    const survey = surveyQuery.data;
    if (survey?.status !== "SUBMITTED") return;

    let active = true;
    void resolveSurveyDraftOwnerKey().then((ownerKey) => {
      if (!active || !ownerKey) return;
      removeSurveyDraft(sessionStorage, {
        contentVersionId: survey.contentVersionId,
        ownerKey,
        roundId: survey.roundId,
      });
    });

    return () => {
      active = false;
    };
  }, [surveyQuery.data]);

  return (
    <PlatformShell
      contentClassName={styles.content!}
      header={
        <PlatformHeader
          actions={
            headerProgress ? (
              <SurveyHeaderProgress
                currentStep={headerProgress.currentStep}
                totalSteps={headerProgress.totalSteps}
              />
            ) : null
          }
          className={styles.surveyHeader!}
          title="설문 정보 입력"
          {...(headerBackAction ? { backAction: headerBackAction } : {})}
        />
      }
      headerSize="compact"
      scroll="child"
    >
      <div className={styles.screen} data-survey-screen="flow">
        {submissionResult ? (
          <SurveySubmissionCompletion
            failureAnalytics={failureAnalytics}
            result={submissionResult}
            returnTo={returnTo}
          />
        ) : (
          <>
            {surveyQuery.isPending ? <SurveyLoadingStatus /> : null}
            {surveyQuery.isError ? (
              <SurveyStatus
                actions={
                  <button
                    className={`${styles.action} ${styles.primaryAction}`}
                    onClick={() => {
                      failureAnalytics.trackRecoveryAttempt("screen-load", "user_retry");
                      void surveyQuery.refetch();
                    }}
                    type="button"
                  >
                    다시 시도
                  </button>
                }
                description={getSurveyLoadErrorMessage(surveyQuery.error)}
                role="alert"
                title="설문을 불러오지 못했습니다."
              />
            ) : null}
            {surveyQuery.data?.status === "SUBMITTED" ? (
              <SurveySubmitted returnTo={returnTo} />
            ) : null}
            {surveyQuery.data?.status === "PENDING" ? (
              <SurveyForm
                cancelHref={returnTo}
                contentVersionId={surveyQuery.data.contentVersionId}
                failureAnalytics={failureAnalytics}
                key={`${surveyQuery.data.roundId}:${surveyQuery.data.contentVersionId}`}
                onHeaderBackActionChange={updateHeaderBackAction}
                onHeaderProgressChange={updateHeaderProgress}
                onRefresh={() => void surveyQuery.refetch()}
                onSubmitted={handleSubmitted}
                roundId={surveyQuery.data.roundId}
                sections={surveyQuery.data.sections}
              />
            ) : null}
          </>
        )}
      </div>
    </PlatformShell>
  );
}

export function SurveyForm({
  cancelHref,
  contentVersionId,
  failureAnalytics,
  onHeaderBackActionChange,
  onHeaderProgressChange,
  onRefresh,
  onSubmitted,
  roundId,
  sections,
}: {
  cancelHref: string;
  contentVersionId: string;
  failureAnalytics: FeatureFailureAnalyticsSession;
  onHeaderBackActionChange: (action: PlatformHeaderBackAction | null) => void;
  onHeaderProgressChange: (progress: SurveyHeaderProgressState | null) => void;
  onRefresh: () => void;
  onSubmitted: (result: SubmissionResponse) => void;
  roundId: string;
  sections: readonly SurveySection[];
}) {
  const totalSteps = sections.length + 1;
  const [formState, dispatchForm] = useReducer(
    reduceSurveyFormState,
    sections,
    createInitialSurveyFormState,
  );
  const {
    answers,
    currentStep,
    errors,
    requiredConsentClickedAt,
    submissionError,
    validationScrollRequest,
  } = formState;
  const isConfirmationStep = currentStep === totalSteps;
  const [submissionCoordinator] = useState(() => new SurveySubmissionCoordinator());
  const flowViewportRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLElement>(null);
  const headerProgressVisibleRef = useRef(false);
  const acceptConsentMutation = useAcceptSensitiveSurveyConsentMutation();
  const submitMutation = useSubmitSurveyMutation();
  const isSubmitting = acceptConsentMutation.isPending || submitMutation.isPending;
  const isRequiredConfirmationChecked = requiredConsentClickedAt !== null;
  const currentSection = sections[currentStep - 1];
  const currentStepId = isConfirmationStep
    ? "confirmation"
    : (currentSection?.sectionKey ?? `step-${currentStep}`);
  const restoreDraft = useCallback(
    (draft: Readonly<{ answers: typeof answers; currentStep: number }>) => {
      dispatchForm({ type: "draftRestored", ...draft });
    },
    [],
  );
  const { clearDraft, draftReady, entryType } = useSurveyDraftSession({
    answers,
    contentVersionId,
    currentStep,
    onDraftRestored: restoreDraft,
    roundId,
    sections,
  });
  const { trackStepExited, trackSubmissionAttempted } = useSurveyParticipationAnalytics({
    currentStep,
    entryType,
    flowVisible: draftReady && entryType !== null && sections.length > 0,
    stepId: currentStepId,
    surveyId: roundId,
    surveyVersion: contentVersionId,
    totalSteps,
  });
  const goToPreviousStep = useCallback(() => {
    trackStepExited("previous");
    dispatchForm({ type: "previousStepRequested" });
  }, [trackStepExited]);

  useEffect(() => {
    if (validationScrollRequest === 0) return;
    const frame = requestAnimationFrame(() => {
      const invalidField =
        flowViewportRef.current?.querySelector<HTMLElement>('[data-invalid="true"]');
      if (!invalidField) return;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      invalidField.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "center",
        inline: "nearest",
      });
      invalidField
        .querySelector<HTMLElement>("button:not([disabled]), input:not([disabled]), textarea")
        ?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [currentStep, validationScrollRequest]);

  useEffect(() => {
    onHeaderBackActionChange(
      currentStep === 1 ? null : { ariaLabel: "이전 설문 단계로", onClick: goToPreviousStep },
    );
    headerProgressVisibleRef.current = false;
    onHeaderProgressChange(null);
  }, [currentStep, goToPreviousStep, onHeaderBackActionChange, onHeaderProgressChange, totalSteps]);

  useEffect(
    () => () => {
      onHeaderBackActionChange(null);
      onHeaderProgressChange(null);
    },
    [onHeaderBackActionChange, onHeaderProgressChange],
  );

  if (sections.length === 0) {
    return (
      <SurveyStatus
        description="잠시 후 다시 접속해 주세요."
        title="표시할 설문 문항을 준비하지 못했습니다."
      />
    );
  }

  if (!draftReady) {
    return <SurveyStatus loading title="임시 저장된 답변을 확인하는 중입니다." />;
  }

  const stepTitle = isConfirmationStep
    ? CONFIRMATION_STEP_TITLE
    : (currentSection?.title ?? sections[0]!.title);
  const progressTitle =
    currentSection?.sectionKey === HOUSEHOLD_SECTION_KEY ? "가구정보" : stepTitle;
  const stepCardTitle = isConfirmationStep ? CONFIRMATION_CARD_TITLE : stepTitle;

  function updateHeaderProgressForScroll(event: UIEvent<HTMLDivElement>) {
    const progress = progressRef.current;
    if (!progress) return;
    const viewportTop = event.currentTarget.getBoundingClientRect().top;
    const showHeaderProgress = shouldShowSurveyHeaderProgress({
      currentlyVisible: headerProgressVisibleRef.current,
      progressBottom: progress.getBoundingClientRect().bottom,
      viewportTop,
    });
    if (showHeaderProgress === headerProgressVisibleRef.current) return;
    headerProgressVisibleRef.current = showHeaderProgress;
    onHeaderProgressChange(showHeaderProgress ? { currentStep, totalSteps } : null);
  }

  function updateAnswer(questionId: string, answer: SurveyAnswerDraft) {
    dispatchForm({ type: "answerChanged", answer, questionId });
  }

  function goToNextStep() {
    if (!currentSection) return;
    const sectionErrors = validateSurveySection(currentSection, answers);
    if (Object.keys(sectionErrors).length > 0) {
      dispatchForm({ type: "sectionValidationFailed", errors: sectionErrors });
      return;
    }
    trackStepExited("next");
    dispatchForm({ type: "nextStepRequested", totalSteps });
  }

  async function submitSurvey() {
    if (!requiredConsentClickedAt || isSubmitting) return;
    const validationErrors = validateSurvey(sections, answers);
    if (Object.keys(validationErrors).length > 0) {
      dispatchForm({
        type: "surveyValidationFailed",
        currentStep: findFirstInvalidSurveySectionIndex(sections, validationErrors) + 1,
        errors: validationErrors,
      });
      return;
    }

    dispatchForm({ type: "submissionStarted" });
    failureAnalytics.trackRecoveryAttempt("submission", "user_retry");
    trackSubmissionAttempted();

    try {
      const result = await submissionCoordinator.submit({
        answers,
        clientClickedAt: requiredConsentClickedAt,
        document: SENSITIVE_INFORMATION_CONSENT,
        ports: {
          acceptConsent: (command, idempotencyKey) =>
            acceptConsentMutation.mutateAsync({ command, idempotencyKey }),
          submitSurvey: (command, idempotencyKey) =>
            submitMutation.mutateAsync({ command, idempotencyKey }),
        },
        roundId,
        sections,
      });
      clearDraft();
      failureAnalytics.trackRecovered("submission");
      trackStepExited("submit");
      onSubmitted(result);
    } catch (error) {
      const failure = classifySubmissionFailure(error);
      if (failure.analytics === "recovered") {
        failureAnalytics.trackRecovered("submission");
      } else if (failure.analytics === "failure") {
        failureAnalytics.trackFailure({
          ...getFeatureFailureDetails(
            error,
            "api",
            failure.stage === "consent" ? "consent_submission_failed" : "survey_submission_failed",
          ),
          failureStage: failure.stage,
          incidentKey: "submission",
          operation: "submission",
          step: currentStep,
          surface: "participation",
        });
      }
      if (Object.keys(failure.fieldErrors).length > 0) {
        dispatchForm({
          type: "submissionFailedWithFieldErrors",
          currentStep: findFirstInvalidSurveySectionIndex(sections, failure.fieldErrors) + 1,
          errors: failure.fieldErrors,
          message: failure.message,
        });
      } else {
        dispatchForm({ type: "submissionFailed", message: failure.message });
      }
      if (failure.refresh) onRefresh();
      if (failure.newAttempt) submissionCoordinator.reset();
    }
  }

  const actions = (
    <SurveyStepActions
      cancelHref={cancelHref}
      currentStep={currentStep}
      isSubmitting={isSubmitting}
      onNext={goToNextStep}
      onPrevious={goToPreviousStep}
      onSubmit={() => void submitSurvey()}
      submitDisabled={!isRequiredConfirmationChecked}
      totalSteps={totalSteps}
    />
  );

  function updateRequiredConsent(checked: boolean) {
    dispatchForm({
      type: "requiredConsentChanged",
      clickedAt: checked ? new Date().toISOString() : null,
    });
    submissionCoordinator.reset();
  }

  return (
    <div className={styles.form} data-survey-step={currentStep}>
      <SurveyFlowLayout>
        <div
          className={styles.flowViewport}
          data-survey-flow-viewport="true"
          key={currentStep}
          onScroll={updateHeaderProgressForScroll}
          ref={flowViewportRef}
        >
          <SurveyProgress
            currentStep={currentStep}
            sectionRef={progressRef}
            stepTitle={progressTitle}
            totalSteps={totalSteps}
          />
          <SurveyStepCard title={stepCardTitle}>
            {isConfirmationStep ? (
              <SurveyConfirmation
                actions={actions}
                checked={isRequiredConfirmationChecked}
                onChange={updateRequiredConsent}
              />
            ) : currentSection ? (
              <SurveySectionFields
                answers={answers}
                errors={errors}
                onAnswerChange={updateAnswer}
                section={currentSection}
              />
            ) : null}
            {submissionError ? (
              <p className={styles.questionError} role="alert">
                {submissionError}
              </p>
            ) : null}
          </SurveyStepCard>
          {isConfirmationStep ? null : actions}
        </div>
      </SurveyFlowLayout>
    </div>
  );
}

function SurveyConfirmation({
  actions,
  checked,
  onChange,
}: {
  actions: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <section className={styles.confirmation}>
      <label className={styles.confirmationCheck}>
        <input
          className={styles.confirmationNativeCheck}
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          type="checkbox"
        />
        <span aria-hidden="true" className={styles.confirmationCheckbox} />
        <span className={styles.confirmationLabel}>
          <span>민감정보 수집·이용에 동의합니다</span>
          <strong>필수</strong>
        </span>
      </label>
      {actions}
    </section>
  );
}

function SurveySubmitted({ returnTo }: { returnTo: string }) {
  return (
    <SurveyStatus
      actions={
        <button
          className={`${styles.action} ${styles.primaryAction}`}
          onClick={() => window.location.replace(returnTo)}
          type="button"
        >
          돌아가기
        </button>
      }
      icon={<span aria-hidden="true" className={styles.submittedIcon} />}
      title="설문 제출을 완료했습니다."
    />
  );
}

function getSurveyLoadErrorMessage(error: unknown): string {
  if (error instanceof VoteApiError) {
    if (error.status === 401) return "로그인 후 설문에 참여할 수 있습니다.";
    if (error.status === 403) return "설문을 조회할 권한이 없습니다.";
    if (error.code === "SURVEY_ACTIVE_ROUND_UNAVAILABLE") return "현재 진행 중인 설문이 없습니다.";
  }
  return "잠시 후 다시 시도해 주세요.";
}
