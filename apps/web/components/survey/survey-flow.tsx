import type { CSSProperties, ReactNode } from "react";
import styles from "./survey.module.css";

export function SurveyFlowLayout({ children }: { children: ReactNode }) {
  return <div className={styles.flow}>{children}</div>;
}

export function SurveyProgress({
  currentStep,
  stepTitle,
  totalSteps,
}: {
  currentStep: number;
  stepTitle: string;
  totalSteps: number;
}) {
  return (
    <section aria-label="설문 진행 상황" className={styles.progressBlock}>
      <p aria-live="polite" className={styles.progressLabel}>
        <span>
          {currentStep}/{totalSteps}
        </span>
        <strong>{stepTitle}</strong>
      </p>
      <ol
        aria-label={`진행 단계 ${currentStep}/${totalSteps}`}
        className={styles.progressBars}
        style={{ "--survey-step-count": totalSteps } as CSSProperties}
      >
        {Array.from({ length: totalSteps }, (_, index) => {
          const step = index + 1;
          const state =
            step < currentStep ? "complete" : step === currentStep ? "current" : "upcoming";

          return (
            <li
              aria-current={state === "current" ? "step" : undefined}
              aria-label={`${step}단계`}
              className={styles.progressBar}
              data-state={state}
              key={step}
            />
          );
        })}
      </ol>
    </section>
  );
}

export function SurveyStepCard({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section aria-labelledby="survey-step-title" className={styles.stepCard}>
      <h2 className={styles.stepTitle} id="survey-step-title">
        {title}
      </h2>
      <div className={styles.stepContent}>{children}</div>
    </section>
  );
}

export function SurveyStepActions({
  cancelHref,
  currentStep,
  isSubmitting = false,
  onNext,
  onPrevious,
  onSubmit,
  submitDisabled = true,
  totalSteps,
}: {
  cancelHref: string;
  currentStep: number;
  isSubmitting?: boolean;
  onNext: () => void;
  onPrevious: () => void;
  onSubmit?: () => void;
  submitDisabled?: boolean;
  totalSteps: number;
}) {
  const isFirstStep = currentStep === 1;
  const isFinalStep = currentStep === totalSteps;
  const submitUnavailable = submitDisabled || !onSubmit || isSubmitting;

  return (
    <div className={styles.actions}>
      {isFirstStep ? (
        <a className={`${styles.action} ${styles.secondaryAction}`} href={cancelHref}>
          취소하기
        </a>
      ) : (
        <button
          className={`${styles.action} ${styles.secondaryAction}`}
          onClick={onPrevious}
          type="button"
        >
          이전으로
        </button>
      )}
      <button
        aria-busy={isFinalStep && isSubmitting ? true : undefined}
        className={`${styles.action} ${styles.primaryAction}`}
        disabled={isFinalStep ? submitUnavailable : false}
        onClick={isFinalStep ? onSubmit : onNext}
        type="button"
      >
        {isFinalStep ? (isSubmitting ? "제출 중…" : "제출하기") : "다음으로"}
      </button>
    </div>
  );
}
