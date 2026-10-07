import { describe, expect, it } from "vitest";
import type { SurveyAnswerState, SurveyValidationErrors } from "@/lib/survey/survey-answer-state";
import type { SurveySection } from "@/lib/survey/survey-contracts";
import {
  createInitialSurveyFormState,
  reduceSurveyFormState,
  type SurveyFormState,
} from "./survey-form-state";

const QUESTION_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_QUESTION_ID = "22222222-2222-4222-8222-222222222222";
const SECTIONS: readonly SurveySection[] = [
  {
    sectionKey: "profile",
    title: "기본 정보",
    questions: [
      {
        maxLength: 100,
        prompt: "답변",
        questionId: QUESTION_ID,
        questionKey: "profile.answer",
        required: true,
        title: "질문",
        type: "SHORT_TEXT",
      },
    ],
  },
];

describe("reduceSurveyFormState", () => {
  it("section에서 초기 답변과 form 제어 상태를 만든다", () => {
    expect(createInitialSurveyFormState(SECTIONS)).toEqual({
      answers: { [QUESTION_ID]: { text: "", type: "SHORT_TEXT" } },
      currentStep: 1,
      errors: {},
      requiredConsentClickedAt: null,
      submissionError: null,
      validationScrollRequest: 0,
    });
  });

  it("답변 변경 시 해당 질문의 일반·하위 오류와 제출 오류만 해제한다", () => {
    const state = createState({
      errors: {
        [QUESTION_ID]: "필수입니다.",
        [`${QUESTION_ID}:item-1`]: "항목을 확인해 주세요.",
        [OTHER_QUESTION_ID]: "다른 오류",
      },
      submissionError: "제출 오류",
    });

    expect(
      reduceSurveyFormState(state, {
        type: "answerChanged",
        answer: { text: "새 답변", type: "SHORT_TEXT" },
        questionId: QUESTION_ID,
      }),
    ).toEqual({
      ...state,
      answers: { [QUESTION_ID]: { text: "새 답변", type: "SHORT_TEXT" } },
      errors: { [OTHER_QUESTION_ID]: "다른 오류" },
      submissionError: null,
    });
  });

  it("이전·다음 단계 이동을 form 경계 안으로 제한한다", () => {
    const firstStep = createState();
    const stillFirst = reduceSurveyFormState(firstStep, { type: "previousStepRequested" });
    const secondStep = reduceSurveyFormState(stillFirst, {
      type: "nextStepRequested",
      totalSteps: 2,
    });
    const stillSecond = reduceSurveyFormState(secondStep, {
      type: "nextStepRequested",
      totalSteps: 2,
    });

    expect(stillFirst.currentStep).toBe(1);
    expect(secondStep.currentStep).toBe(2);
    expect(stillSecond.currentStep).toBe(2);
  });

  it("현재 section 오류는 기존 오류에 합치고 validation scroll 요청을 증가시킨다", () => {
    const state = createState({
      errors: { [OTHER_QUESTION_ID]: "기존 오류" },
      validationScrollRequest: 3,
    });

    expect(
      reduceSurveyFormState(state, {
        type: "sectionValidationFailed",
        errors: { [QUESTION_ID]: "새 오류" },
      }),
    ).toEqual({
      ...state,
      errors: {
        [OTHER_QUESTION_ID]: "기존 오류",
        [QUESTION_ID]: "새 오류",
      },
      validationScrollRequest: 4,
    });
  });

  it("전체 검증 오류는 교체하고 첫 invalid 단계로 이동한다", () => {
    const errors = { [QUESTION_ID]: "전체 검증 오류" };
    const state = createState({
      currentStep: 3,
      errors: { [OTHER_QUESTION_ID]: "이전 오류" },
      validationScrollRequest: 1,
    });

    expect(
      reduceSurveyFormState(state, {
        type: "surveyValidationFailed",
        currentStep: 1,
        errors,
      }),
    ).toEqual({
      ...state,
      currentStep: 1,
      errors,
      validationScrollRequest: 2,
    });
  });

  it("제출 시작과 일반 실패는 field 상태를 유지하면서 제출 메시지만 바꾼다", () => {
    const state = createState({
      errors: { [QUESTION_ID]: "기존 오류" },
      submissionError: "이전 제출 오류",
    });
    const started = reduceSurveyFormState(state, { type: "submissionStarted" });
    const failed = reduceSurveyFormState(started, {
      type: "submissionFailed",
      message: "새 제출 오류",
    });

    expect(started).toEqual({ ...state, submissionError: null });
    expect(failed).toEqual({ ...started, submissionError: "새 제출 오류" });
  });

  it("서버 field 오류는 교체하고 invalid 단계·scroll 요청·제출 메시지를 함께 갱신한다", () => {
    const errors = { [QUESTION_ID]: "서버 field 오류" };
    const state = createState({ currentStep: 3, validationScrollRequest: 2 });

    expect(
      reduceSurveyFormState(state, {
        type: "submissionFailedWithFieldErrors",
        currentStep: 1,
        errors,
        message: "입력값을 확인해 주세요.",
      }),
    ).toEqual({
      ...state,
      currentStep: 1,
      errors,
      submissionError: "입력값을 확인해 주세요.",
      validationScrollRequest: 3,
    });
  });

  it("동의 변경은 제출 오류를 해제하고 draft 복원은 답변과 단계를 함께 바꾼다", () => {
    const clickedAt = "2026-10-07T00:00:00.000Z";
    const state = createState({ submissionError: "이전 제출 오류" });
    const consentChanged = reduceSurveyFormState(state, {
      type: "requiredConsentChanged",
      clickedAt,
    });
    const restoredAnswers: SurveyAnswerState = {
      [QUESTION_ID]: { text: "복원된 답변", type: "SHORT_TEXT" },
    };
    const restored = reduceSurveyFormState(consentChanged, {
      type: "draftRestored",
      answers: restoredAnswers,
      currentStep: 2,
    });

    expect(consentChanged.requiredConsentClickedAt).toBe(clickedAt);
    expect(consentChanged.submissionError).toBeNull();
    expect(restored.answers).toBe(restoredAnswers);
    expect(restored.currentStep).toBe(2);
    expect(restored.requiredConsentClickedAt).toBe(clickedAt);
  });
});

function createState(
  overrides: Partial<{
    answers: SurveyAnswerState;
    currentStep: number;
    errors: SurveyValidationErrors;
    requiredConsentClickedAt: string | null;
    submissionError: string | null;
    validationScrollRequest: number;
  }> = {},
): SurveyFormState {
  return {
    answers: { [QUESTION_ID]: { text: "", type: "SHORT_TEXT" } },
    currentStep: 1,
    errors: {},
    requiredConsentClickedAt: null,
    submissionError: null,
    validationScrollRequest: 0,
    ...overrides,
  };
}
