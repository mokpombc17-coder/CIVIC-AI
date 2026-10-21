import { describe, expect, it } from "vitest";
import {
  currentSurveyResponseSchema,
  submissionResponseSchema,
  submitSurveyRequestSchema,
} from "./survey-contracts";

const ROUND_ID = "11111111-1111-4111-8111-111111111111";
const CONTENT_ID = "22222222-2222-4222-8222-222222222222";
const QUESTION_ID = "33333333-3333-4333-8333-333333333333";
const OPTION_ID = "44444444-4444-4444-8444-444444444444";

const VALID_QUESTION = {
  questionId: QUESTION_ID,
  questionKey: "profile.choice",
  title: "선택 문항",
  prompt: "하나를 선택해 주세요.",
  required: true,
  type: "SINGLE_CHOICE",
  options: [{ optionId: OPTION_ID, label: "선택지" }],
} as const;

describe("survey v4 contracts", () => {
  it("PENDING 응답을 status discriminator로 해석한다", () => {
    expect(currentSurveyResponseSchema.parse(createPendingResponse()).status).toBe("PENDING");
  });

  it("비어 있거나 선택할 수 없는 현재 설문을 거부한다", () => {
    expect(
      currentSurveyResponseSchema.safeParse({ ...createPendingResponse(), sections: [] }).success,
    ).toBe(false);
    expect(
      currentSurveyResponseSchema.safeParse(
        createPendingResponse([{ ...VALID_QUESTION, options: [] }]),
      ).success,
    ).toBe(false);
    expect(
      currentSurveyResponseSchema.safeParse(
        createPendingResponse([
          {
            ...VALID_QUESTION,
            type: "MATRIX_SINGLE_CHOICE",
            items: [],
          },
        ]),
      ).success,
    ).toBe(false);
  });

  it("선택 문항(required: false)을 허용한다", () => {
    expect(
      currentSurveyResponseSchema.safeParse(
        createPendingResponse([{ ...VALID_QUESTION, required: false }]),
      ).success,
    ).toBe(true);
  });

  it("화면 상태를 덮어쓰는 중복 Question 식별자를 거부한다", () => {
    expect(
      currentSurveyResponseSchema.safeParse(
        createPendingResponse([
          VALID_QUESTION,
          { ...VALID_QUESTION, questionKey: "profile.another-choice" },
        ]),
      ).success,
    ).toBe(false);
  });

  it("선택지와 행렬 Item의 중복 식별자를 거부한다", () => {
    expect(
      currentSurveyResponseSchema.safeParse(
        createPendingResponse([
          {
            ...VALID_QUESTION,
            options: [VALID_QUESTION.options[0], VALID_QUESTION.options[0]],
          },
        ]),
      ).success,
    ).toBe(false);
    const item = {
      itemId: "66666666-6666-4666-8666-666666666666",
      itemKey: "row",
      itemLabel: "행",
    };
    expect(
      currentSurveyResponseSchema.safeParse(
        createPendingResponse([
          {
            ...VALID_QUESTION,
            type: "MATRIX_SINGLE_CHOICE",
            items: [item, item],
          },
        ]),
      ).success,
    ).toBe(false);
  });

  it("서로 모순되는 선택 개수와 숫자 범위를 거부한다", () => {
    expect(
      currentSurveyResponseSchema.safeParse(
        createPendingResponse([
          {
            ...VALID_QUESTION,
            type: "MULTIPLE_CHOICE",
            minimumSelections: 2,
            maximumSelections: 1,
          },
        ]),
      ).success,
    ).toBe(false);
    expect(
      currentSurveyResponseSchema.safeParse(
        createPendingResponse([
          {
            ...VALID_QUESTION,
            type: "NUMBER",
            minimum: 10,
            maximum: 1,
            decimalScale: 0,
          },
        ]),
      ).success,
    ).toBe(false);
  });

  it("브라우저에서 안전하게 렌더링할 수 없는 척도 범위를 거부한다", () => {
    expect(
      currentSurveyResponseSchema.safeParse(
        createPendingResponse([
          {
            ...VALID_QUESTION,
            type: "SCALE",
            minimum: 0,
            maximum: 10_000,
            minimumLabel: null,
            maximumLabel: null,
          },
        ]),
      ).success,
    ).toBe(false);
  });

  it("preview 성공은 responseId 없이 해석한다", () => {
    expect(
      submissionResponseSchema.parse({
        status: "PREVIEW_VALIDATED",
        persisted: false,
        roundId: ROUND_ID,
        contentVersionId: CONTENT_ID,
        validatedAt: "2026-09-01T07:00:00Z",
      }),
    ).not.toHaveProperty("responseId");
  });

  it("선택 문항에 답하지 않은 제출은 동의 receipt 없이 허용한다", () => {
    expect(
      submitSurveyRequestSchema.safeParse({
        roundId: ROUND_ID,
        answers: [],
      }).success,
    ).toBe(true);
  });

  it("동의 receipt가 있으면 UUID 형식만 허용한다", () => {
    expect(
      submitSurveyRequestSchema.safeParse({
        roundId: ROUND_ID,
        consentReceiptId: "not-a-uuid",
        answers: [],
      }).success,
    ).toBe(false);
  });
});

function createPendingResponse(questions: readonly unknown[] = [VALID_QUESTION]) {
  return {
    status: "PENDING",
    roundId: ROUND_ID,
    contentVersionId: CONTENT_ID,
    sections: [
      {
        sectionKey: "profile",
        title: "사용자 특성",
        questions,
      },
    ],
  };
}
