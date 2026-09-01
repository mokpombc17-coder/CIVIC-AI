"use client";

import { useMemo, useState, type ReactNode } from "react";
import { PlatformHeader, PlatformShell } from "@/components/platform-shell";
import {
  createSurveyAnswerState,
  validateSurvey,
  validateSurveySection,
  type SurveyAnswerDraft,
  type SurveyAnswerState,
  type SurveyValidationErrors,
} from "@/lib/survey/survey-answer-state";
import { SURVEY_MOCK_CONTENT } from "@/lib/survey/survey-mock-data";
import { sortSurveySections, type PublishedSurveyContent } from "@/lib/survey/survey-model";
import { SurveyFlowLayout, SurveyProgress, SurveyStepActions, SurveyStepCard } from "./survey-flow";
import { SurveySectionFields } from "./survey-question-fields";
import styles from "./survey.module.css";

const CONFIRMATION_STEP_TITLE = "필수 동의·확인";
const CONFIRMATION_CARD_TITLE = "필수 동의 항목";
const HOUSEHOLD_SECTION_KEY = "household-information";

export function SurveyScreen({ cancelHref }: { cancelHref: string }) {
  return (
    <PlatformShell
      className={styles.shell!}
      contentClassName={styles.content!}
      header={<PlatformHeader leading={null} title="설문 정보 입력" />}
      scroll="child"
    >
      <div className={styles.screen} data-survey-screen="flow">
        <SurveyForm cancelHref={cancelHref} content={SURVEY_MOCK_CONTENT} />
      </div>
    </PlatformShell>
  );
}

function SurveyForm({
  cancelHref,
  content,
}: {
  cancelHref: string;
  content: PublishedSurveyContent;
}) {
  const sections = useMemo(() => sortSurveySections(content.sections), [content.sections]);
  const totalSteps = sections.length + 1;
  const [currentStep, setCurrentStep] = useState(1);
  const [answers, setAnswers] = useState<SurveyAnswerState>(() => createSurveyAnswerState(content));
  const [errors, setErrors] = useState<SurveyValidationErrors>({});
  const [isRequiredConfirmationChecked, setIsRequiredConfirmationChecked] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  if (isSubmitted) {
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
    if (!isRequiredConfirmationChecked) return;

    const validationErrors = validateSurvey(content, answers);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      setCurrentStep(findFirstInvalidSectionIndex(sections, validationErrors) + 1);
      return;
    }
    setIsSubmitted(true);
  }

  const actions = (
    <SurveyStepActions
      cancelHref={cancelHref}
      currentStep={currentStep}
      isSubmitting={false}
      onNext={goToNextStep}
      onPrevious={() => setCurrentStep((step) => Math.max(step - 1, 1))}
      onSubmit={submitSurvey}
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

function SurveySubmitted({ cancelHref }: { cancelHref: string }) {
  return (
    <SurveyStatus
      actions={
        <a className={`${styles.action} ${styles.primaryAction}`} href={cancelHref}>
          돌아가기
        </a>
      }
      description="현재 화면은 디자인 확인용이며 응답은 저장되지 않습니다."
      title="설문 제출을 완료했습니다."
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
