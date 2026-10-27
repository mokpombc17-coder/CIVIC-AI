import { ConsentApiError } from "@/lib/consent/consent-api";
import { VoteApiError } from "@/lib/vote/vote-fetch";
import { surveyAnswerErrorKey, type SurveyValidationErrors } from "./survey-answer-state";
import type { SurveySection } from "./survey-contracts";

export type ConsentSubmissionRecovery = Readonly<{
  loginRequired: boolean;
  message: string;
  newAttempt: boolean;
}>;

export type SurveySubmissionRecovery = Readonly<{
  fieldErrors: SurveyValidationErrors;
  loginRequired: boolean;
  message: string;
  newAttempt: boolean;
  refresh: boolean;
}>;

// 토큰 재갱신까지 실패해 401이 화면까지 오면 다시 로그인해야만 제출할 수 있으므로 로그인으로 안내함
// 재갱신이 네트워크 문제로 잠깐 실패한 경우도 있어 제출하기로 다시 시도하는 길은 그대로 둠
const LOGIN_REQUIRED_MESSAGE = "로그인이 만료되었습니다. 다시 로그인한 뒤 제출해 주세요.";

export type SubmissionFailureAnalytics = "failure" | "recovered" | "none";

export type SubmissionFailureRecovery = SurveySubmissionRecovery &
  Readonly<{
    analytics: SubmissionFailureAnalytics;
    stage: "consent" | "survey";
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

export function classifySubmissionFailure(error: unknown): SubmissionFailureRecovery {
  if (error instanceof ConsentApiError) {
    return {
      ...classifyConsentSubmissionError(error),
      analytics: "failure",
      fieldErrors: {},
      refresh: false,
      stage: "consent",
    };
  }

  return {
    ...classifySurveySubmissionError(error),
    analytics: getSurveySubmissionFailureAnalytics(error),
    stage: "survey",
  };
}

function getSurveySubmissionFailureAnalytics(error: unknown): SubmissionFailureAnalytics {
  if (!(error instanceof VoteApiError)) return "failure";
  // 이미 제출된 설문은 실패가 아닌 복구로 기록함
  if (error.code === "CURRENT_SURVEY_ALREADY_SUBMITTED") return "recovered";
  // 동의 receipt 불일치는 화면과 서버 규칙이 어긋난 것이라 실패로 기록함
  if (hasConsentReceiptViolation(error)) return "failure";
  // 응답 검증 실패는 사용자 입력 문제라 실패로 기록하지 않음
  if (error.code === "SURVEY_RESPONSE_VALIDATION_FAILED") return "none";
  return "failure";
}

export function classifyConsentSubmissionError(
  error: Pick<ConsentApiError, "code" | "status">,
): ConsentSubmissionRecovery {
  if (error.status === 401) {
    return { loginRequired: true, message: LOGIN_REQUIRED_MESSAGE, newAttempt: false };
  }

  // 화면은 고정된 동의 문서 버전으로 요청하므로 서버 문서가 바뀌면 다시 시도해도 같은 오류가 남
  // 선택 문항 답을 지우면 동의 없이 제출할 수 있어 그 방법을 안내함
  if (error.code === "CONSENT_DOCUMENT_CHANGED") {
    return {
      loginRequired: false,
      message:
        "동의 정보가 변경되어 지금은 동의할 수 없습니다. 선택 문항의 답변을 지우면 동의 없이 제출할 수 있습니다.",
      newAttempt: true,
    };
  }

  if (error.code === "IDEMPOTENCY_CONFLICT" || error.code === "INVALID_IDEMPOTENCY_KEY") {
    return {
      loginRequired: false,
      message: "동의 요청을 새로 준비했습니다. 다시 제출해 주세요.",
      newAttempt: true,
    };
  }

  return {
    loginRequired: false,
    message: "동의 정보를 저장하지 못했습니다. 같은 내용으로 다시 시도해 주세요.",
    newAttempt: false,
  };
}

export function classifySurveySubmissionError(error: unknown): SurveySubmissionRecovery {
  if (!(error instanceof VoteApiError)) {
    return {
      fieldErrors: {},
      loginRequired: false,
      message: "제출하지 못했습니다. 같은 내용으로 다시 시도해 주세요.",
      newAttempt: false,
      refresh: false,
    };
  }

  if (error.status === 401) {
    return {
      fieldErrors: {},
      loginRequired: true,
      message: LOGIN_REQUIRED_MESSAGE,
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
      loginRequired: false,
      message: "이미 제출된 설문입니다. 완료 상태를 확인합니다.",
      newAttempt: false,
      refresh: true,
    };
  }

  if (error.code === "SURVEY_SUBMISSION_ROUND_CHANGED") {
    return {
      fieldErrors,
      loginRequired: false,
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
      loginRequired: false,
      message: "민감정보 동의를 다시 확인한 뒤 제출해 주세요.",
      newAttempt: true,
      refresh: false,
    };
  }

  if (hasConsentReceiptViolation(error)) {
    return {
      fieldErrors,
      loginRequired: false,
      message: "민감정보 동의 상태가 바뀌었습니다. 동의 항목을 확인한 뒤 다시 제출해 주세요.",
      newAttempt: true,
      refresh: false,
    };
  }

  if (error.code === "IDEMPOTENCY_CONFLICT" || error.code === "INVALID_IDEMPOTENCY_KEY") {
    return {
      fieldErrors,
      loginRequired: false,
      message: "제출 정보를 새로 준비했습니다. 다시 제출해 주세요.",
      newAttempt: true,
      refresh: false,
    };
  }

  return {
    fieldErrors,
    loginRequired: false,
    message:
      error.code === "SURVEY_RESPONSE_VALIDATION_FAILED"
        ? "입력한 답변을 다시 확인해 주세요."
        : "제출하지 못했습니다. 같은 내용으로 다시 시도해 주세요.",
    newAttempt: false,
    refresh: false,
  };
}

const CONSENT_RECEIPT_VIOLATION_CODES = new Set([
  "SURVEY_CONSENT_RECEIPT_REQUIRED",
  "SURVEY_CONSENT_RECEIPT_NOT_ALLOWED",
]);

function hasConsentReceiptViolation(error: VoteApiError): boolean {
  return (
    error.code === "SURVEY_RESPONSE_VALIDATION_FAILED" &&
    (error.problem?.violations ?? []).some((violation) =>
      CONSENT_RECEIPT_VIOLATION_CODES.has(violation.code),
    )
  );
}
