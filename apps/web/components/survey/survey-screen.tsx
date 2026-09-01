"use client";

import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { PlatformHeader, PlatformShell } from "@/components/platform-shell";
import type { SubmissionResponse, SurveySection } from "@/lib/survey/survey-contracts";
import {
  buildSubmitSurveyRequest,
  createSurveyAnswerState,
  surveyAnswerErrorKey,
  validateSurvey,
  validateSurveySection,
  type SurveyAnswerDraft,
  type SurveyAnswerState,
  type SurveyValidationErrors,
} from "@/lib/survey/survey-answer-state";
import { useCurrentSurveyQuery, useSubmitSurveyMutation } from "@/lib/survey/survey-queries";
import {
  prepareSurveySubmission,
  type PendingSurveySubmission,
} from "@/lib/survey/survey-submission";
import { VoteApiError } from "@/lib/vote/vote-fetch";
import { SurveyFlowLayout, SurveyProgress, SurveyStepActions, SurveyStepCard } from "./survey-flow";
import { SurveySectionFields } from "./survey-question-fields";
import styles from "./survey.module.css";

const CONFIRMATION_STEP_TITLE = "필수 동의·확인";
const CONFIRMATION_CARD_TITLE = "필수 동의 항목";
const HOUSEHOLD_SECTION_KEY = "household-information";

export function SurveyScreen({ cancelHref }: { cancelHref: string }) {
  const surveyQuery = useCurrentSurveyQuery();

  return (
    <PlatformShell
      className={styles.shell!}
      contentClassName={styles.content!}
      header={<PlatformHeader leading={null} title="설문 정보 입력" />}
      scroll="child"
    >
      <div className={styles.screen} data-survey-screen="flow">
        {surveyQuery.isPending ? <SurveyStatus title="설문을 불러오는 중입니다." /> : null}
        {surveyQuery.isError ? (
          <SurveyStatus
            actions={
              <button
                className={`${styles.action} ${styles.primaryAction}`}
                onClick={() => void surveyQuery.refetch()}
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
          <SurveySubmitted cancelHref={cancelHref} responseId={surveyQuery.data.responseId} />
        ) : null}
        {surveyQuery.data?.status === "PENDING" ? (
          <SurveyForm
            cancelHref={cancelHref}
            key={surveyQuery.data.contentVersionId}
            onRefresh={() => void surveyQuery.refetch()}
            roundId={surveyQuery.data.roundId}
            sections={surveyQuery.data.sections}
          />
        ) : null}
      </div>
    </PlatformShell>
  );
}

function SurveyForm({
  cancelHref,
  onRefresh,
  roundId,
  sections,
}: {
  cancelHref: string;
  onRefresh: () => void;
  roundId: string;
  sections: readonly SurveySection[];
}) {
  const totalSteps = sections.length + 1;
  const [currentStep, setCurrentStep] = useState(1);
  const [answers, setAnswers] = useState<SurveyAnswerState>(() =>
    createSurveyAnswerState(sections),
  );
  const [errors, setErrors] = useState<SurveyValidationErrors>({});
  const [isRequiredConfirmationChecked, setIsRequiredConfirmationChecked] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<SubmissionResponse | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const pendingSubmission = useRef<PendingSurveySubmission | null>(null);
  const submitMutation = useSubmitSurveyMutation();

  if (submissionResult) {
    return (
      <SurveySubmitted
        cancelHref={cancelHref}
        preview={!submissionResult.persisted}
        {...(submissionResult.persisted ? { responseId: submissionResult.responseId } : {})}
      />
    );
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
      return;
    }
    setCurrentStep((step) => Math.min(step + 1, totalSteps));
  }

  async function submitSurvey() {
    if (!isRequiredConfirmationChecked || submitMutation.isPending) return;
    const validationErrors = validateSurvey(sections, answers);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      setCurrentStep(findFirstInvalidSectionIndex(sections, validationErrors) + 1);
      return;
    }

    const payload = buildSubmitSurveyRequest(roundId, sections, answers);
    const prepared = prepareSurveySubmission(payload, pendingSubmission.current);
    pendingSubmission.current = prepared;
    setSubmissionError(null);

    try {
      const result = await submitMutation.mutateAsync({
        command: prepared.payload,
        idempotencyKey: prepared.idempotencyKey,
      });
      setSubmissionResult(result);
    } catch (error) {
      const apiErrors = getSurveySubmissionErrors(error);
      if (Object.keys(apiErrors.fieldErrors).length > 0) {
        setErrors(apiErrors.fieldErrors);
        setCurrentStep(findFirstInvalidSectionIndex(sections, apiErrors.fieldErrors) + 1);
      }
      setSubmissionError(apiErrors.message);
      if (apiErrors.refresh) onRefresh();
      if (apiErrors.newAttempt) pendingSubmission.current = null;
    }
  }

  const actions = (
    <SurveyStepActions
      cancelHref={cancelHref}
      currentStep={currentStep}
      isSubmitting={submitMutation.isPending}
      onNext={goToNextStep}
      onPrevious={() => setCurrentStep((step) => Math.max(step - 1, 1))}
      onSubmit={() => void submitSurvey()}
      submitDisabled={!isRequiredConfirmationChecked}
      totalSteps={totalSteps}
    />
  );

  return (
    <div className={styles.form} data-survey-step={currentStep}>
      <SurveyFlowLayout>
        <SurveyProgress
          currentStep={currentStep}
          stepTitle={progressTitle}
          totalSteps={totalSteps}
        />
        <div className={styles.flowViewport} data-survey-flow-viewport="true" key={currentStep}>
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
      <p>동의를 거부할 수 있으나, 동의하지 않으면 가입할 수 없습니다.</p>
      {actions}
    </section>
  );
}

function SurveySubmitted({
  cancelHref,
  preview = false,
  responseId,
}: {
  cancelHref: string;
  preview?: boolean;
  responseId?: string;
}) {
  return (
    <SurveyStatus
      actions={
        <>
          {responseId ? (
            <Link
              className={`${styles.action} ${styles.primaryAction}`}
              href={`/survey/responses/${responseId}`}
            >
              내 응답 보기
            </Link>
          ) : null}
          <a
            className={`${styles.action} ${responseId ? styles.secondaryAction : styles.primaryAction}`}
            href={cancelHref}
          >
            돌아가기
          </a>
        </>
      }
      description={
        preview
          ? "미리보기 검증이 완료되었습니다. 이 응답은 서버에 저장되지 않습니다."
          : "제출한 응답은 수정할 수 없습니다."
      }
      title={preview ? "설문 검증을 완료했습니다." : "설문 제출을 완료했습니다."}
    />
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
