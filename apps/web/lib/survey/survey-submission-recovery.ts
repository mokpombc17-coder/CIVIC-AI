import type { ConsentApiError } from "@/lib/consent/consent-api";
import { VoteApiError } from "@/lib/vote/vote-fetch";
import { surveyAnswerErrorKey, type SurveyValidationErrors } from "./survey-answer-state";
import type { SurveySection } from "./survey-contracts";

export type ConsentSubmissionRecovery = Readonly<{
  message: string;
  newAttempt: boolean;
}>;

export type SurveySubmissionRecovery = Readonly<{
  fieldErrors: SurveyValidationErrors;
  message: string;
  newAttempt: boolean;
  refresh: boolean;
}>;

export function findFirstInvalidSurveySectionIndex(
  sections: readonly SurveySection[],
  errors: SurveyValidationErrors,
): number {
  const errorKeys = Object.keys(errors);
  const index = sections.findIndex((section) =>
    section.questions.some((question) =>
      errorKeys.some(
        (key) => key === question.questionId || key.startsWith(`${question.questionId}:`),
      ),
    ),
  );

  return index < 0 ? 0 : index;
}

export function classifyConsentSubmissionError(
  error: Pick<ConsentApiError, "code">,
): ConsentSubmissionRecovery {
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

export function classifySurveySubmissionError(error: unknown): SurveySubmissionRecovery {
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
