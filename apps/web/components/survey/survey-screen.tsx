"use client";

import { useState } from "react";
import { PlatformHeader, PlatformShell } from "@/components/platform-shell";
import { SurveyFlowLayout, SurveyProgress, SurveyStepActions, SurveyStepCard } from "./survey-flow";
import styles from "./survey.module.css";

const SURVEY_STEP_TITLES = [
  "일반 개인정보",
  "가구 정보",
  "생활 · 경제",
  "가치 · 정치 성향",
  "미디어 · 의견 성향",
  "사회 · 기관 신뢰",
  "매체 이용 · 정보 습관",
  "필수 동의·확인",
] as const;

const SURVEY_TOTAL_STEPS = SURVEY_STEP_TITLES.length;

export function SurveyScreen({ cancelHref }: { cancelHref: string }) {
  const [currentStep, setCurrentStep] = useState(1);
  const stepTitle = SURVEY_STEP_TITLES[currentStep - 1] ?? SURVEY_STEP_TITLES[0];

  return (
    <PlatformShell
      contentClassName={styles.content!}
      header={<PlatformHeader leading={null} title="설문 정보 입력" />}
    >
      <div className={styles.screen} data-survey-screen="flow" data-survey-step={currentStep}>
        <SurveyFlowLayout>
          <SurveyProgress
            currentStep={currentStep}
            stepTitle={stepTitle}
            totalSteps={SURVEY_TOTAL_STEPS}
          />
          <SurveyStepCard title={stepTitle}>
            <p className={styles.preparationMessage}>
              문항 조회 API가 연결되면 이 영역에 설문 항목이 표시됩니다.
            </p>
          </SurveyStepCard>
          <SurveyStepActions
            cancelHref={cancelHref}
            currentStep={currentStep}
            onNext={() => setCurrentStep((step) => Math.min(step + 1, SURVEY_TOTAL_STEPS))}
            onPrevious={() => setCurrentStep((step) => Math.max(step - 1, 1))}
            totalSteps={SURVEY_TOTAL_STEPS}
          />
        </SurveyFlowLayout>
      </div>
    </PlatformShell>
  );
}
