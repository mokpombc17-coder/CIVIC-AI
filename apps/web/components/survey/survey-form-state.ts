import {
  createSurveyAnswerState,
  type SurveyAnswerDraft,
  type SurveyAnswerState,
  type SurveyValidationErrors,
} from "@/lib/survey/survey-answer-state";
import type { SurveySection } from "@/lib/survey/survey-contracts";

export type SurveyFormState = Readonly<{
  answers: SurveyAnswerState;
  currentStep: number;
  errors: SurveyValidationErrors;
  requiredConsentClickedAt: string | null;
  submissionError: string | null;
  validationScrollRequest: number;
}>;

export type SurveyFormAction =
  | Readonly<{
      type: "draftRestored";
      answers: SurveyAnswerState;
      currentStep: number;
    }>
  | Readonly<{
      type: "answerChanged";
      answer: SurveyAnswerDraft;
      questionId: string;
    }>
  | Readonly<{ type: "previousStepRequested" }>
  | Readonly<{ type: "nextStepRequested"; totalSteps: number }>
  | Readonly<{ type: "sectionValidationFailed"; errors: SurveyValidationErrors }>
  | Readonly<{
      type: "surveyValidationFailed";
      currentStep: number;
      errors: SurveyValidationErrors;
    }>
  | Readonly<{ type: "submissionStarted" }>
  | Readonly<{ type: "submissionFailed"; message: string }>
  | Readonly<{
      type: "submissionFailedWithFieldErrors";
      currentStep: number;
      errors: SurveyValidationErrors;
      message: string;
    }>
  | Readonly<{ type: "requiredConsentChanged"; clickedAt: string | null }>;

export function createInitialSurveyFormState(sections: readonly SurveySection[]): SurveyFormState {
  return {
    answers: createSurveyAnswerState(sections),
    currentStep: 1,
    errors: {},
    requiredConsentClickedAt: null,
    submissionError: null,
    validationScrollRequest: 0,
  };
}

export function reduceSurveyFormState(
  state: SurveyFormState,
  action: SurveyFormAction,
): SurveyFormState {
  switch (action.type) {
    case "draftRestored":
      return {
        ...state,
        answers: action.answers,
        currentStep: action.currentStep,
      };
    case "answerChanged":
      return {
        ...state,
        answers: { ...state.answers, [action.questionId]: action.answer },
        errors: removeQuestionErrors(state.errors, action.questionId),
        submissionError: null,
      };
    case "previousStepRequested":
      return { ...state, currentStep: Math.max(state.currentStep - 1, 1) };
    case "nextStepRequested":
      return {
        ...state,
        currentStep: Math.min(state.currentStep + 1, action.totalSteps),
      };
    case "sectionValidationFailed":
      return {
        ...state,
        errors: { ...state.errors, ...action.errors },
        validationScrollRequest: state.validationScrollRequest + 1,
      };
    case "surveyValidationFailed":
      return {
        ...state,
        currentStep: action.currentStep,
        errors: action.errors,
        validationScrollRequest: state.validationScrollRequest + 1,
      };
    case "submissionStarted":
      return { ...state, submissionError: null };
    case "submissionFailed":
      return { ...state, submissionError: action.message };
    case "submissionFailedWithFieldErrors":
      return {
        ...state,
        currentStep: action.currentStep,
        errors: action.errors,
        submissionError: action.message,
        validationScrollRequest: state.validationScrollRequest + 1,
      };
    case "requiredConsentChanged":
      return {
        ...state,
        requiredConsentClickedAt: action.clickedAt,
        submissionError: null,
      };
  }
}

function removeQuestionErrors(
  errors: SurveyValidationErrors,
  questionId: string,
): SurveyValidationErrors {
  return Object.fromEntries(
    Object.entries(errors).filter(
      ([key]) => key !== questionId && !key.startsWith(`${questionId}:`),
    ),
  );
}
