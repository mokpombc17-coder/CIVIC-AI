import { describe, expect, it } from "vitest";
import { ConsentApiError } from "@/lib/consent/consent-api";
import { VoteApiError } from "@/lib/vote/vote-fetch";
import type { SurveySection } from "./survey-contracts";
import {
  classifyConsentSubmissionError,
  classifySubmissionFailure,
  classifySurveySubmissionError,
  findFirstInvalidSurveySectionIndex,
} from "./survey-submission-recovery";

const FIRST_QUESTION_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_QUESTION_ID = "22222222-2222-4222-8222-222222222222";
const MATRIX_ITEM_ID = "33333333-3333-4333-8333-333333333333";

const sections: SurveySection[] = [
  {
    sectionKey: "first",
    title: "첫 번째 섹션",
    questions: [
      {
        questionId: FIRST_QUESTION_ID,
        questionKey: "first.question",
        title: "첫 번째 질문",
        prompt: "선택해 주세요",
        required: true,
        type: "SINGLE_CHOICE",
        options: [{ optionId: "44444444-4444-4444-8444-444444444444", label: "예" }],
      },
    ],
  },
  {
    sectionKey: "second",
    title: "두 번째 섹션",
    questions: [
      {
        questionId: SECOND_QUESTION_ID,
        questionKey: "second.question",
        title: "두 번째 질문",
        prompt: "각 항목을 선택해 주세요",
        required: true,
        type: "MATRIX_SINGLE_CHOICE",
        items: [{ itemId: MATRIX_ITEM_ID, itemKey: "item", itemLabel: "항목" }],
        options: [{ optionId: "55555555-5555-4555-8555-555555555555", label: "예" }],
      },
    ],
  },
];

function createVoteApiError(
  code: string,
  violations: readonly Record<string, unknown>[] = [],
): VoteApiError {
  return new VoteApiError(400, "Bad Request", "/api/v1/surveys/current/submissions", {
    type: "about:blank",
    title: "Bad Request",
    status: 400,
    detail: "설문 제출에 실패했습니다.",
    instance: "/api/v1/surveys/current/submissions",
    code,
    violations,
  });
}

describe("survey submission recovery", () => {
  it("동의 문서 변경은 동의부터 새로 시도하도록 분류한다", () => {
    expect(classifyConsentSubmissionError({ code: "CONSENT_DOCUMENT_CHANGED" })).toEqual({
      message: "동의 정보가 변경되어 제출할 수 없습니다. 잠시 후 다시 시도해 주세요.",
      newAttempt: true,
    });
  });

  it.each(["IDEMPOTENCY_CONFLICT", "INVALID_IDEMPOTENCY_KEY"])(
    "%s 동의 오류는 새 멱등 요청을 준비하도록 분류한다",
    (code) => {
      expect(classifyConsentSubmissionError({ code })).toEqual({
        message: "동의 요청을 새로 준비했습니다. 다시 제출해 주세요.",
        newAttempt: true,
      });
    },
  );

  it("일반 동의 오류는 같은 요청을 재시도하도록 유지한다", () => {
    expect(classifyConsentSubmissionError({ code: "CONSENT_STORAGE_FAILED" })).toEqual({
      message: "동의 정보를 저장하지 못했습니다. 같은 내용으로 다시 시도해 주세요.",
      newAttempt: false,
    });
  });

  it.each([
    [
      "CURRENT_SURVEY_ALREADY_SUBMITTED",
      false,
      true,
      "이미 제출된 설문입니다. 완료 상태를 확인합니다.",
    ],
    [
      "SURVEY_SUBMISSION_ROUND_CHANGED",
      true,
      true,
      "설문 회차가 변경되어 최신 설문을 다시 불러옵니다.",
    ],
    [
      "SENSITIVE_INFORMATION_CONSENT_REQUIRED",
      true,
      false,
      "민감정보 동의를 다시 확인한 뒤 제출해 주세요.",
    ],
    ["CONSENT_RECEIPT_INVALID", true, false, "민감정보 동의를 다시 확인한 뒤 제출해 주세요."],
    ["IDEMPOTENCY_CONFLICT", true, false, "제출 정보를 새로 준비했습니다. 다시 제출해 주세요."],
    ["INVALID_IDEMPOTENCY_KEY", true, false, "제출 정보를 새로 준비했습니다. 다시 제출해 주세요."],
  ])("%s 오류의 새 시도와 새로고침 정책을 보존한다", (code, newAttempt, refresh, message) => {
    expect(classifySurveySubmissionError(createVoteApiError(code))).toEqual({
      fieldErrors: {},
      message,
      newAttempt,
      refresh,
    });
  });

  it("서버 validation violation을 Question과 Matrix Item 오류로 변환한다", () => {
    const recovery = classifySurveySubmissionError(
      createVoteApiError("SURVEY_RESPONSE_VALIDATION_FAILED", [
        {
          code: "INVALID_ANSWER",
          questionId: FIRST_QUESTION_ID,
          message: "첫 번째 답변을 확인해 주세요.",
        },
        {
          code: "INVALID_ITEM_ANSWER",
          questionId: SECOND_QUESTION_ID,
          itemId: MATRIX_ITEM_ID,
        },
        { code: "IGNORED_WITHOUT_QUESTION" },
      ]),
    );

    expect(recovery).toEqual({
      fieldErrors: {
        [FIRST_QUESTION_ID]: "첫 번째 답변을 확인해 주세요.",
        [`${SECOND_QUESTION_ID}:${MATRIX_ITEM_ID}`]: "답변을 다시 확인해 주세요.",
      },
      message: "입력한 답변을 다시 확인해 주세요.",
      newAttempt: false,
      refresh: false,
    });
  });

  it("Vote API가 아닌 오류는 같은 제출을 재시도하도록 분류한다", () => {
    expect(classifySurveySubmissionError(new Error("network unavailable"))).toEqual({
      fieldErrors: {},
      message: "제출하지 못했습니다. 같은 내용으로 다시 시도해 주세요.",
      newAttempt: false,
      refresh: false,
    });
  });

  it("동의 오류는 consent 단계 실패로 기록하고 새로고침하지 않는다", () => {
    expect(
      classifySubmissionFailure(
        new ConsentApiError(409, "CONSENT_DOCUMENT_CHANGED", "consent document changed"),
      ),
    ).toEqual({
      analytics: "failure",
      fieldErrors: {},
      message: "동의 정보가 변경되어 제출할 수 없습니다. 잠시 후 다시 시도해 주세요.",
      newAttempt: true,
      refresh: false,
      stage: "consent",
    });
  });

  it.each([
    ["CURRENT_SURVEY_ALREADY_SUBMITTED", "recovered"],
    ["SURVEY_RESPONSE_VALIDATION_FAILED", "none"],
    ["SURVEY_SUBMISSION_ROUND_CHANGED", "failure"],
    ["IDEMPOTENCY_CONFLICT", "failure"],
  ] as const)("%s 설문 제출 오류의 analytics 기록 방식은 %s이다", (code, analytics) => {
    const error = createVoteApiError(code);

    expect(classifySubmissionFailure(error)).toEqual({
      ...classifySurveySubmissionError(error),
      analytics,
      stage: "survey",
    });
  });

  it("Vote API가 아닌 설문 제출 오류는 survey 단계 실패로 기록한다", () => {
    expect(classifySubmissionFailure(new Error("network unavailable"))).toMatchObject({
      analytics: "failure",
      stage: "survey",
    });
  });

  it("Question과 Matrix Item 오류가 속한 첫 번째 섹션을 찾는다", () => {
    expect(findFirstInvalidSurveySectionIndex(sections, { [FIRST_QUESTION_ID]: "오류" })).toBe(0);
    expect(
      findFirstInvalidSurveySectionIndex(sections, {
        [`${SECOND_QUESTION_ID}:${MATRIX_ITEM_ID}`]: "오류",
      }),
    ).toBe(1);
  });

  it("섹션과 연결되지 않은 오류는 첫 번째 섹션으로 복구한다", () => {
    expect(findFirstInvalidSurveySectionIndex(sections, { unknown: "오류" })).toBe(0);
  });
});
