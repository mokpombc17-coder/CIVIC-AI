"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PlatformHeader, PlatformShell } from "@/components/platform-shell";
import {
  createSubmitSurveyRequest,
  createSurveyAnswerState,
  validateSurvey,
  validateSurveySection,
  type SurveyAnswerDraft,
  type SurveyAnswerState,
  type SurveyValidationErrors,
} from "@/lib/survey/survey-answer-state";
import { sortSurveySections, type CurrentSurveyResponse } from "@/lib/survey/survey-contracts";
import {
  getOrCreatePendingSurveySubmission,
  type PendingSurveySubmission,
} from "@/lib/survey/survey-idempotent-submission";
import { createSurveyHref } from "@/lib/survey/survey-navigation";
import { useCurrentSurveyQuery, useSubmitSurveyMutation } from "@/lib/survey/survey-queries";
import { VoteApiError } from "@/lib/vote/vote-fetch";
import { SurveyFlowLayout, SurveyProgress, SurveyStepActions, SurveyStepCard } from "./survey-flow";
import { SurveySectionFields } from "./survey-question-fields";
import styles from "./survey.module.css";

const CONFIRMATION_STEP_TITLE = "필수 동의·확인";
const CONFIRMATION_CARD_TITLE = "필수 동의 항목";
const HOUSEHOLD_SECTION_KEY = "household-information";

export function SurveyScreen({ cancelHref }: { cancelHref: string }) {
  const currentSurveyQuery = useCurrentSurveyQuery();

  return (
    <PlatformShell
      className={styles.shell!}
      contentClassName={styles.content!}
      header={<PlatformHeader leading={null} title="설문 정보 입력" />}
    >
      <div className={styles.screen} data-survey-screen="flow">
        {currentSurveyQuery.isPending ? <SurveyStatus title="설문을 불러오고 있습니다." /> : null}
        {currentSurveyQuery.isError ? (
          <SurveyLoadError
            error={currentSurveyQuery.error}
            loginReturnTo={createSurveyHref(cancelHref)}
            onRetry={() => void currentSurveyQuery.refetch()}
          />
        ) : null}
        {currentSurveyQuery.data ? (
          <SurveyForm cancelHref={cancelHref} survey={currentSurveyQuery.data} />
        ) : null}
      </div>
    </PlatformShell>
  );
}

function SurveyForm({ cancelHref, survey }: { cancelHref: string; survey: CurrentSurveyResponse }) {
  const sections = useMemo(
    () => sortSurveySections(survey.content.sections),
    [survey.content.sections],
  );
  const totalSteps = sections.length + 1;
  const [currentStep, setCurrentStep] = useState(1);
  const [answers, setAnswers] = useState<SurveyAnswerState>(() =>
    createSurveyAnswerState(survey.content),
  );
  const [errors, setErrors] = useState<SurveyValidationErrors>({});
  const [isRequiredConfirmationChecked, setIsRequiredConfirmationChecked] = useState(false);
  const pendingSubmissionRef = useRef<PendingSurveySubmission | null>(null);
  const roundIdRef = useRef(survey.round.id);
  const submitMutation = useSubmitSurveyMutation();

  useEffect(() => {
    if (roundIdRef.current === survey.round.id) return;
    roundIdRef.current = survey.round.id;
    setAnswers(createSurveyAnswerState(survey.content));
    setErrors({});
    setCurrentStep(1);
    setIsRequiredConfirmationChecked(false);
    pendingSubmissionRef.current = null;
    submitMutation.reset();
  }, [submitMutation, survey.content, survey.round.id]);

  if (survey.submitted || submitMutation.isSuccess) {
    return <SurveySubmitted cancelHref={cancelHref} />;
  }

  if (sections.length === 0) {
    return (
      <SurveyStatus
        description="잠시 후 다시 접속해 주세요."
        title="표시할 설문 문항을 준비하지 못했습니다."
      />
    );
  }

  const currentSection = sections[currentStep - 1];
  const isConfirmationStep = currentStep === totalSteps;
  const stepTitle = isConfirmationStep
    ? CONFIRMATION_STEP_TITLE
    : (currentSection?.title ?? sections[0]!.title);
  const progressTitle =
    currentSection?.sectionKey === HOUSEHOLD_SECTION_KEY ? "가구정보" : stepTitle;
  const stepCardTitle = isConfirmationStep ? CONFIRMATION_CARD_TITLE : stepTitle;

  function updateAnswer(questionId: string, answer: SurveyAnswerDraft) {
    setAnswers((current) => ({ ...current, [questionId]: answer }));
    setErrors((current) => {
      if (!current[questionId]) return current;
      const next = { ...current };
      delete next[questionId];
      return next;
    });
    submitMutation.reset();
  }

  function goToNextStep() {
    if (!currentSection) return;
    const sectionErrors = validateSurveySection(currentSection, answers);
    if (Object.keys(sectionErrors).length > 0) {
      setErrors((current) => ({ ...current, ...sectionErrors }));
      return;
    }
    setCurrentStep((step) => Math.min(step + 1, totalSteps));
  }

  function submitSurvey() {
    if (!isRequiredConfirmationChecked || submitMutation.isPending) return;

    const validationErrors = validateSurvey(survey.content, answers);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      setCurrentStep(findFirstInvalidSectionIndex(sections, validationErrors) + 1);
      return;
    }

    const payload = createSubmitSurveyRequest(survey.round.id, survey.content, answers);
    const pending = getOrCreatePendingSurveySubmission(pendingSubmissionRef.current, payload);
    pendingSubmissionRef.current = pending;

    submitMutation.mutate(
      { command: pending.payload, idempotencyKey: pending.idempotencyKey },
      {
        onError: (error) => {
          const violationErrors = getViolationErrors(error);
          if (Object.keys(violationErrors).length > 0) {
            setErrors(violationErrors);
            setCurrentStep(findFirstInvalidSectionIndex(sections, violationErrors) + 1);
          }
          if (error instanceof VoteApiError && error.code === "SURVEY_SUBMISSION_ROUND_CHANGED") {
            pendingSubmissionRef.current = null;
          }
        },
        onSuccess: () => {
          pendingSubmissionRef.current = null;
        },
      },
    );
  }

  const actions = (
    <SurveyStepActions
      cancelHref={cancelHref}
      currentStep={currentStep}
      isSubmitting={submitMutation.isPending}
      onNext={goToNextStep}
      onPrevious={() => {
        submitMutation.reset();
        setCurrentStep((step) => Math.max(step - 1, 1));
      }}
      onSubmit={submitSurvey}
      submitDisabled={!isRequiredConfirmationChecked}
      totalSteps={totalSteps}
    />
  );

  return (
    <div data-survey-step={currentStep}>
      <SurveyFlowLayout>
        <SurveyProgress
          currentStep={currentStep}
          stepTitle={progressTitle}
          totalSteps={totalSteps}
        />
        <SurveyStepCard title={stepCardTitle}>
          {isConfirmationStep ? (
            <SurveyConfirmation
              actions={actions}
              checked={isRequiredConfirmationChecked}
              onChange={setIsRequiredConfirmationChecked}
            />
          ) : currentSection ? (
            <SurveySectionFields
              answers={answers}
              errors={errors}
              onAnswerChange={updateAnswer}
              section={currentSection}
            />
          ) : null}
        </SurveyStepCard>
        {submitMutation.isError ? <SurveySubmitError error={submitMutation.error} /> : null}
        {isConfirmationStep ? null : actions}
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
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          type="checkbox"
        />
        <span className={styles.confirmationLabel}>
          <span>민감정보 수집·이용에 동의합니다</span>
          <strong>필수</strong>
        </span>
      </label>
      <p>동의를 거부할 수 있으나, 동의하지 않으면 가입할 수 없습니다.</p>
      {actions}
    </section>
  );
}

function SurveySubmitted({ cancelHref }: { cancelHref: string }) {
  return (
    <SurveyStatus
      actions={
        <>
          <Link
            className={`${styles.action} ${styles.primaryAction}`}
            href="/survey/responses/latest"
          >
            내 응답 보기
          </Link>
          <a className={`${styles.action} ${styles.secondaryAction}`} href={cancelHref}>
            돌아가기
          </a>
        </>
      }
      description="제출한 응답은 수정할 수 없습니다."
      title="설문 제출을 완료했습니다."
    />
  );
}

function SurveyLoadError({
  error,
  loginReturnTo,
  onRetry,
}: {
  error: unknown;
  loginReturnTo: string;
  onRetry: () => void;
}) {
  const authenticationRequired = error instanceof VoteApiError && error.status === 401;
  let title = "설문을 불러오지 못했습니다.";
  let description = "잠시 후 다시 시도해 주세요.";

  if (authenticationRequired) {
    title = "로그인이 필요합니다.";
    description = "로그인 후 설문을 이어서 진행할 수 있습니다.";
  } else if (error instanceof VoteApiError && error.status === 403) {
    title = "설문에 접근할 권한이 없습니다.";
    description = "계정 권한이나 서비스 설정을 확인해 주세요.";
  } else if (error instanceof VoteApiError && error.code === "SURVEY_ACTIVE_ROUND_UNAVAILABLE") {
    title = "설문을 준비하고 있습니다.";
    description = "현재 진행 가능한 설문이 없습니다. 잠시 후 다시 접속해 주세요.";
  }

  return (
    <SurveyStatus
      actions={
        authenticationRequired ? (
          <Link
            className={`${styles.action} ${styles.primaryAction}`}
            href={{ pathname: "/login", query: { returnTo: loginReturnTo } }}
          >
            로그인하기
          </Link>
        ) : (
          <button
            className={`${styles.action} ${styles.primaryAction}`}
            onClick={onRetry}
            type="button"
          >
            다시 시도
          </button>
        )
      }
      description={description}
      role="alert"
      title={title}
    />
  );
}

function SurveySubmitError({ error }: { error: unknown }) {
  let message = "설문을 제출하지 못했습니다. 같은 내용으로 다시 시도해 주세요.";
  if (error instanceof VoteApiError) {
    if (error.status === 401) message = "로그인 상태를 확인한 뒤 다시 제출해 주세요.";
    else if (error.status === 403) message = "설문을 제출할 권한이 없습니다.";
    else if (error.code === "CURRENT_SURVEY_ALREADY_SUBMITTED") {
      message = "이미 제출한 설문입니다. 제출 상태를 다시 확인하고 있습니다.";
    } else if (error.code === "SURVEY_SUBMISSION_ROUND_CHANGED") {
      message = "진행 중인 설문이 변경되었습니다. 새 설문을 다시 불러오고 있습니다.";
    } else if (error.code === "IDEMPOTENCY_CONFLICT") {
      message = "제출 상태가 변경되었습니다. 입력 내용을 확인한 뒤 다시 시도해 주세요.";
    } else if (error.code === "SURVEY_RESPONSE_VALIDATION_FAILED") {
      message = "확인이 필요한 답변이 있습니다. 표시된 문항을 확인해 주세요.";
    }
  }
  return (
    <p className={styles.submitError} role="alert">
      {message}
    </p>
  );
}

function SurveyStatus({
  actions,
  description,
  role = "status",
  title,
}: {
  actions?: ReactNode;
  description?: string;
  role?: "alert" | "status";
  title: string;
}) {
  return (
    <section className={styles.statusCard} role={role}>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {actions ? <div className={styles.statusActions}>{actions}</div> : null}
    </section>
  );
}

function getViolationErrors(error: unknown): SurveyValidationErrors {
  if (!(error instanceof VoteApiError) || !error.problem?.violations) return {};
  return Object.fromEntries(
    error.problem.violations.flatMap((violation) => {
      const questionId = violation.details?.questionId;
      return typeof questionId === "string" ? [[questionId, violation.message]] : [];
    }),
  );
}

function findFirstInvalidSectionIndex(
  sections: ReturnType<typeof sortSurveySections>,
  errors: SurveyValidationErrors,
): number {
  const index = sections.findIndex((section) =>
    section.groups.some((group) =>
      group.questions.some((question) => Boolean(errors[question.questionId])),
    ),
  );
  return index < 0 ? 0 : index;
}
