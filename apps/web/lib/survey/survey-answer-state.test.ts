import { describe, expect, it } from "vitest";
import type { SurveySection } from "./survey-contracts";
import {
  buildSubmitSurveyRequest,
  createSurveyAnswerState,
  hasAnsweredOptionalQuestion,
  validateSurvey,
} from "./survey-answer-state";

const ROUND_ID = "11111111-1111-4111-8111-111111111111";
const CONSENT_RECEIPT_ID = "77777777-7777-4777-8777-777777777777";
const SINGLE_ID = "22222222-2222-4222-8222-222222222222";
const MATRIX_ID = "33333333-3333-4333-8333-333333333333";
const ITEM_A = "44444444-4444-4444-8444-444444444444";
const ITEM_B = "55555555-5555-4555-8555-555555555555";
const OPTION_YES = "66666666-6666-4666-8666-666666666666";
const OPTION_NO = "77777777-7777-4777-8777-777777777777";
const RESIDENCE_ID = "88888888-8888-4888-8888-888888888888";
const OPTIONAL_ID = "99999999-9999-4999-8999-999999999999";

const sections: SurveySection[] = [
  {
    sectionKey: "test-section",
    title: "테스트",
    questions: [
      {
        questionId: SINGLE_ID,
        questionKey: "test.single",
        title: "단일 선택",
        prompt: "선택해 주세요",
        required: true,
        type: "SINGLE_CHOICE",
        options: [{ optionId: OPTION_YES, label: "예" }],
      },
      {
        questionId: MATRIX_ID,
        questionKey: "test.matrix",
        title: "행렬",
        prompt: "각 항목을 선택해 주세요",
        required: true,
        type: "MATRIX_SINGLE_CHOICE",
        items: [
          { itemId: ITEM_A, itemKey: "a", itemLabel: "항목 A" },
          { itemId: ITEM_B, itemKey: "b", itemLabel: "항목 B" },
        ],
        options: [
          { optionId: OPTION_YES, label: "있음" },
          { optionId: OPTION_NO, label: "없음" },
        ],
      },
    ],
  },
];

const optionalSections: SurveySection[] = [
  ...sections,
  {
    sectionKey: "optional-section",
    title: "선택",
    questions: [
      {
        questionId: OPTIONAL_ID,
        questionKey: "test.optional",
        title: "선택 문항",
        prompt: "선택해 주세요",
        required: false,
        type: "SINGLE_CHOICE",
        options: [
          { optionId: OPTION_YES, label: "예" },
          { optionId: OPTION_NO, label: "아니오" },
        ],
      },
    ],
  },
];

function createRequiredAnswers() {
  return {
    [SINGLE_ID]: { type: "SINGLE_CHOICE", selection: { optionId: OPTION_YES } },
    [MATRIX_ID]: {
      type: "MATRIX_SINGLE_CHOICE",
      itemAnswers: {
        [ITEM_A]: { optionId: OPTION_YES },
        [ITEM_B]: { optionId: OPTION_NO },
      },
    },
  } as const;
}

describe("survey answer state", () => {
  it("Question과 행렬 Item을 분리해 관리할 수 있는 빈 상태를 만든다", () => {
    const answers = createSurveyAnswerState(sections);
    expect(Object.keys(answers)).toHaveLength(2);
    expect(answers[MATRIX_ID]).toEqual({
      type: "MATRIX_SINGLE_CHOICE",
      itemAnswers: { [ITEM_A]: null, [ITEM_B]: null },
    });
    expect(Object.keys(validateSurvey(sections, answers))).toHaveLength(3);
  });

  it("행렬 Item을 한 Question answer 안에 접고 kind와 inputText를 보내지 않는다", () => {
    const payload = buildSubmitSurveyRequest(ROUND_ID, null, sections, {
      [SINGLE_ID]: { type: "SINGLE_CHOICE", selection: { optionId: OPTION_YES } },
      [MATRIX_ID]: {
        type: "MATRIX_SINGLE_CHOICE",
        itemAnswers: {
          [ITEM_A]: { optionId: OPTION_YES },
          [ITEM_B]: { optionId: OPTION_NO },
        },
      },
    });

    expect(payload.answers).toHaveLength(2);
    expect(payload).not.toHaveProperty("consentReceiptId");
    expect(payload.answers[1]).toEqual({
      questionId: MATRIX_ID,
      type: "MATRIX_SINGLE_CHOICE",
      itemAnswers: [
        { itemId: ITEM_A, selection: { optionId: OPTION_YES } },
        { itemId: ITEM_B, selection: { optionId: OPTION_NO } },
      ],
    });
    expect(JSON.stringify(payload)).not.toMatch(/kind|inputText/);
  });

  it("답하지 않은 선택 문항은 answers와 동의 receipt 없이 제출한다", () => {
    const answers = {
      ...createRequiredAnswers(),
      [OPTIONAL_ID]: { type: "SINGLE_CHOICE", selection: null },
    } as const;

    expect(hasAnsweredOptionalQuestion(optionalSections, answers)).toBe(false);
    const payload = buildSubmitSurveyRequest(ROUND_ID, null, optionalSections, answers);

    expect(payload).not.toHaveProperty("consentReceiptId");
    expect(payload.answers.map((answer) => answer.questionId)).toEqual([SINGLE_ID, MATRIX_ID]);
  });

  it("선택 문항에 답하면 해당 answer와 동의 receipt를 함께 제출한다", () => {
    const answers = {
      ...createRequiredAnswers(),
      [OPTIONAL_ID]: { type: "SINGLE_CHOICE", selection: { optionId: OPTION_NO } },
    } as const;

    expect(hasAnsweredOptionalQuestion(optionalSections, answers)).toBe(true);
    const payload = buildSubmitSurveyRequest(
      ROUND_ID,
      CONSENT_RECEIPT_ID,
      optionalSections,
      answers,
    );

    expect(payload.consentReceiptId).toBe(CONSENT_RECEIPT_ID);
    expect(payload.answers.map((answer) => answer.questionId)).toEqual([
      SINGLE_ID,
      MATRIX_ID,
      OPTIONAL_ID,
    ]);
  });

  it("선택 문항 응답 여부와 동의 receipt 유무가 다르면 payload를 만들지 않는다", () => {
    const answered = {
      ...createRequiredAnswers(),
      [OPTIONAL_ID]: { type: "SINGLE_CHOICE", selection: { optionId: OPTION_NO } },
    } as const;
    const unanswered = {
      ...createRequiredAnswers(),
      [OPTIONAL_ID]: { type: "SINGLE_CHOICE", selection: null },
    } as const;

    expect(() => buildSubmitSurveyRequest(ROUND_ID, null, optionalSections, answered)).toThrow(
      "선택 문항 응답 여부와 동의 receipt 유무가 일치해야 합니다.",
    );
    expect(() =>
      buildSubmitSurveyRequest(ROUND_ID, CONSENT_RECEIPT_ID, optionalSections, unanswered),
    ).toThrow("선택 문항 응답 여부와 동의 receipt 유무가 일치해야 합니다.");
  });

  it("우편번호 검색 주소는 시군구 단계가 없는 경우에도 유효하게 처리한다", () => {
    const residenceSections: SurveySection[] = [
      {
        sectionKey: "personal-information",
        title: "일반 개인정보",
        questions: [
          {
            questionId: RESIDENCE_ID,
            questionKey: "demographics.residence",
            title: "주소지",
            prompt: "주소지를 선택해 주세요",
            required: true,
            type: "SHORT_TEXT",
            maxLength: 200,
          },
        ],
      },
    ];

    expect(
      validateSurvey(residenceSections, {
        [RESIDENCE_ID]: {
          type: "SHORT_TEXT",
          inputMethod: "POSTCODE",
          inputSegments: ["세종특별자치시", "", "나성동"],
          text: "세종특별자치시 나성동",
        },
      }),
    ).toEqual({});
  });

  it("직접 입력 주소는 세 항목이 모두 입력되어야 한다", () => {
    const residenceSections: SurveySection[] = [
      {
        sectionKey: "personal-information",
        title: "일반 개인정보",
        questions: [
          {
            questionId: RESIDENCE_ID,
            questionKey: "demographics.residence",
            title: "주소지",
            prompt: "주소지를 입력해 주세요",
            required: true,
            type: "SHORT_TEXT",
            maxLength: 200,
          },
        ],
      },
    ];

    expect(
      validateSurvey(residenceSections, {
        [RESIDENCE_ID]: {
          type: "SHORT_TEXT",
          inputMethod: "MANUAL",
          inputSegments: ["경기도", "", "백현동"],
          text: "경기도 백현동",
        },
      }),
    ).toEqual({ [RESIDENCE_ID]: "항목을 모두 입력해 주세요." });
  });
});
