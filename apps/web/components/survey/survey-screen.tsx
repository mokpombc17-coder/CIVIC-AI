"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState, type ReactNode, type UIEvent } from "react";
import {
  PlatformHeader,
  PlatformShell,
  type PlatformHeaderBackAction,
} from "@/components/platform-shell";
import { ConsentApiError } from "@/lib/consent/consent-api";
import { useAcceptSensitiveSurveyConsentMutation } from "@/lib/consent/consent-queries";
import {
  getFeatureFailureDetails,
  type FeatureFailureAnalyticsSession,
} from "@/lib/analytics/feature-failure-analytics";
import type { SubmissionResponse, SurveySection } from "@/lib/survey/survey-contracts";
import {
  createSurveyAnswerState,
  surveyAnswerErrorKey,
  validateSurvey,
  validateSurveySection,
  type SurveyAnswerDraft,
  type SurveyAnswerState,
  type SurveyValidationErrors,
} from "@/lib/survey/survey-answer-state";
import { useCurrentSurveyQuery, useSubmitSurveyMutation } from "@/lib/survey/survey-queries";
import { canReturnAfterSurveySubmission } from "@/lib/survey/survey-completion";
import { removeSurveyDraft, resolveSurveyDraftOwnerKey } from "@/lib/survey/survey-draft-storage";
import { SurveySubmissionCoordinator } from "@/lib/survey/survey-submission-coordinator";
import { VoteApiError } from "@/lib/vote/vote-fetch";
import { getServiceEligibilityQueryOptions } from "@/lib/vote/service-eligibility";
import {
  SurveyFlowLayout,
  SurveyHeaderProgress,
  SurveyProgress,
  SurveyStepActions,
  SurveyStepCard,
  shouldShowSurveyHeaderProgress,
} from "./survey-flow";
import { SurveyLoadingStatus } from "./survey-loading";
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

function SurveyForm({
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
  const [currentStep, setCurrentStep] = useState(1);
  const isConfirmationStep = currentStep === totalSteps;
  const [answers, setAnswers] = useState<SurveyAnswerState>(() =>
    createSurveyAnswerState(sections),
  );
  const [errors, setErrors] = useState<SurveyValidationErrors>({});
  const [requiredConsentClickedAt, setRequiredConsentClickedAt] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [validationScrollRequest, setValidationScrollRequest] = useState(0);
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
  const { clearDraft, draftReady, entryType } = useSurveyDraftSession({
    answers,
    contentVersionId,
    currentStep,
    roundId,
    sections,
    setAnswers,
    setCurrentStep,
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
    setCurrentStep((step) => Math.max(step - 1, 1));
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
    setAnswers((current) => ({ ...current, [questionId]: answer }));
    setSubmissionError(null);
    setErrors((current) =>
      Object.fromEntries(
        Object.entries(current).filter(
          ([key]) => key !== questionId && !key.startsWith(`${questionId}:`),
        ),
      ),
    );
  }

  function goToNextStep() {
    if (!currentSection) return;
    const sectionErrors = validateSurveySection(currentSection, answers);
    if (Object.keys(sectionErrors).length > 0) {
      setErrors((current) => ({ ...current, ...sectionErrors }));
      setValidationScrollRequest((request) => request + 1);
      return;
    }
    trackStepExited("next");
    setCurrentStep((step) => Math.min(step + 1, totalSteps));
  }

  async function submitSurvey() {
    if (!requiredConsentClickedAt || isSubmitting) return;
    const validationErrors = validateSurvey(sections, answers);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      setCurrentStep(findFirstInvalidSectionIndex(sections, validationErrors) + 1);
      setValidationScrollRequest((request) => request + 1);
      return;
    }

    setSubmissionError(null);
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
      if (error instanceof ConsentApiError) {
        const consentError = getConsentSubmissionError(error);
        failureAnalytics.trackFailure({
          ...getFeatureFailureDetails(error, "api", "consent_submission_failed"),
          failureStage: "consent",
          incidentKey: "submission",
          operation: "submission",
          step: currentStep,
          surface: "participation",
        });
        setSubmissionError(consentError.message);
        if (consentError.newAttempt) submissionCoordinator.reset();
        return;
      }
      const apiErrors = getSurveySubmissionErrors(error);
      if (error instanceof VoteApiError && error.code === "CURRENT_SURVEY_ALREADY_SUBMITTED") {
        failureAnalytics.trackRecovered("submission");
      } else if (!(
        error instanceof VoteApiError && error.code === "SURVEY_RESPONSE_VALIDATION_FAILED"
      )) {
        failureAnalytics.trackFailure({
          ...getFeatureFailureDetails(error, "api", "survey_submission_failed"),
          failureStage: "survey",
          incidentKey: "submission",
          operation: "submission",
          step: currentStep,
          surface: "participation",
        });
      }
      if (Object.keys(apiErrors.fieldErrors).length > 0) {
        setErrors(apiErrors.fieldErrors);
        setCurrentStep(findFirstInvalidSectionIndex(sections, apiErrors.fieldErrors) + 1);
        setValidationScrollRequest((request) => request + 1);
      }
      setSubmissionError(apiErrors.message);
      if (apiErrors.refresh) onRefresh();
      if (apiErrors.newAttempt) submissionCoordinator.reset();
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
    setRequiredConsentClickedAt(checked ? new Date().toISOString() : null);
    submissionCoordinator.reset();
    setSubmissionError(null);
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

function SurveySubmissionCompletion({
  failureAnalytics,
  result,
  returnTo,
}: Readonly<{
  failureAnalytics: FeatureFailureAnalyticsSession;
  result: SubmissionResponse;
  returnTo: string;
}>) {
  const eligibilityQuery = useQuery({
    ...getServiceEligibilityQueryOptions(),
    enabled: result.persisted,
    staleTime: 0,
  });
  const canReturn =
    eligibilityQuery.isSuccess &&
    !eligibilityQuery.isFetching &&
    canReturnAfterSurveySubmission(result, eligibilityQuery.data);

  useEffect(() => {
    if (!result.persisted || eligibilityQuery.isFetching) return;
    if (canReturn) {
      failureAnalytics.trackRecovered("post-submit-check");
      return;
    }
    if (eligibilityQuery.isError || eligibilityQuery.isSuccess) {
      const details = eligibilityQuery.isError
        ? getFeatureFailureDetails(eligibilityQuery.error, "api", "eligibility_check_failed")
        : {
            errorCode: "eligibility_not_ready",
            errorSource: "api" as const,
            retryable: true,
          };
      failureAnalytics.trackFailure({
        ...details,
        incidentKey: "post-submit-check",
        operation: "post_submit_check",
        retryCount: Math.max(0, eligibilityQuery.failureCount - 1),
        surface: "completion",
      });
    }
  }, [
    canReturn,
    eligibilityQuery.error,
    eligibilityQuery.failureCount,
    eligibilityQuery.isError,
    eligibilityQuery.isFetching,
    eligibilityQuery.isSuccess,
    failureAnalytics,
    result.persisted,
  ]);

  useEffect(() => {
    if (!canReturn) return;
    window.location.replace(returnTo);
  }, [canReturn, returnTo]);

  if (!result.persisted) {
    return (
      <SurveyStatus
        description="미리보기 응답은 저장되지 않습니다."
        icon={<span aria-hidden="true" className={styles.submittedIcon} />}
        title="설문 응답 검증을 완료했습니다."
      />
    );
  }

  if (eligibilityQuery.isFetching || canReturn) {
    return (
      <SurveyStatus
        description="서비스 이용 가능 여부를 확인하고 있습니다."
        loading
        title="설문 제출을 완료했습니다."
      />
    );
  }

  return (
    <SurveyStatus
      actions={
        <button
          className={`${styles.action} ${styles.primaryAction}`}
          onClick={() => {
            failureAnalytics.trackRecoveryAttempt("post-submit-check", "user_retry");
            void eligibilityQuery.refetch();
          }}
          type="button"
        >
          다시 확인
        </button>
      }
      description="완료 상태가 아직 반영되지 않았습니다. 잠시 후 다시 확인해 주세요."
      icon={<span aria-hidden="true" className={styles.submittedIcon} />}
      role="alert"
      title="설문 제출을 완료했습니다."
    />
  );
}

function SurveyStatus({
  actions,
  description,
  icon,
  loading = false,
  role = "status",
  title,
}: {
  actions?: ReactNode;
  description?: string;
  icon?: ReactNode;
  loading?: boolean;
  role?: "alert" | "status";
  title: string;
}) {
  return (
    <section aria-busy={loading || undefined} className={styles.statusCard} role={role}>
      {loading ? <span aria-hidden="true" className={styles.loadingSpinner} /> : null}
      {icon}
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {actions ? <div className={styles.statusActions}>{actions}</div> : null}
    </section>
  );
}

function findFirstInvalidSectionIndex(
  sections: readonly SurveySection[],
  errors: SurveyValidationErrors,
): number {
  const index = sections.findIndex((section) =>
    section.questions.some((question) =>
      Object.keys(errors).some(
        (key) => key === question.questionId || key.startsWith(`${question.questionId}:`),
      ),
    ),
  );
  return index < 0 ? 0 : index;
}

function getSurveyLoadErrorMessage(error: unknown): string {
  if (error instanceof VoteApiError) {
    if (error.status === 401) return "로그인 후 설문에 참여할 수 있습니다.";
    if (error.status === 403) return "설문을 조회할 권한이 없습니다.";
    if (error.code === "SURVEY_ACTIVE_ROUND_UNAVAILABLE") return "현재 진행 중인 설문이 없습니다.";
  }
  return "잠시 후 다시 시도해 주세요.";
}

function getConsentSubmissionError(error: ConsentApiError): {
  message: string;
  newAttempt: boolean;
} {
  if (error.code === "CONSENT_DOCUMENT_CHANGED") {
    return {
      message: "동의 정보가 변경되어 제출할 수 없습니다. 잠시 후 다시 시도해 주세요.",
      newAttempt: true,
    };
  }
  if (error.code === "IDEMPOTENCY_CONFLICT" || error.code === "INVALID_IDEMPOTENCY_KEY") {
    return {
      message: "동의 요청을 새로 준비했습니다. 다시 제출해 주세요.",
      newAttempt: true,
    };
  }
  return {
    message: "동의 정보를 저장하지 못했습니다. 같은 내용으로 다시 시도해 주세요.",
    newAttempt: false,
  };
}

function getSurveySubmissionErrors(error: unknown): {
  fieldErrors: SurveyValidationErrors;
  message: string;
  newAttempt: boolean;
  refresh: boolean;
} {
  if (!(error instanceof VoteApiError)) {
    return {
      fieldErrors: {},
      message: "제출하지 못했습니다. 같은 내용으로 다시 시도해 주세요.",
      newAttempt: false,
      refresh: false,
    };
  }
  const fieldErrors = Object.fromEntries(
    (error.problem?.violations ?? []).flatMap((violation) => {
      if (!violation.questionId) return [];
      return [
        [
          surveyAnswerErrorKey(violation.questionId, violation.itemId),
          violation.message ?? "답변을 다시 확인해 주세요.",
        ],
      ];
    }),
  );
  if (error.code === "CURRENT_SURVEY_ALREADY_SUBMITTED") {
    return {
      fieldErrors,
      message: "이미 제출된 설문입니다. 완료 상태를 확인합니다.",
      newAttempt: false,
      refresh: true,
    };
  }
  if (error.code === "SURVEY_SUBMISSION_ROUND_CHANGED") {
    return {
      fieldErrors,
      message: "설문 회차가 변경되어 최신 설문을 다시 불러옵니다.",
      newAttempt: true,
      refresh: true,
    };
  }
  if (
    error.code === "SENSITIVE_INFORMATION_CONSENT_REQUIRED" ||
    error.code === "CONSENT_RECEIPT_INVALID"
  ) {
    return {
      fieldErrors,
      message: "민감정보 동의를 다시 확인한 뒤 제출해 주세요.",
      newAttempt: true,
      refresh: false,
    };
  }
  if (error.code === "IDEMPOTENCY_CONFLICT" || error.code === "INVALID_IDEMPOTENCY_KEY") {
    return {
      fieldErrors,
      message: "제출 정보를 새로 준비했습니다. 다시 제출해 주세요.",
      newAttempt: true,
      refresh: false,
    };
  }
  return {
    fieldErrors,
    message:
      error.code === "SURVEY_RESPONSE_VALIDATION_FAILED"
        ? "입력한 답변을 다시 확인해 주세요."
        : "제출하지 못했습니다. 같은 내용으로 다시 시도해 주세요.",
    newAttempt: false,
    refresh: false,
  };
}
