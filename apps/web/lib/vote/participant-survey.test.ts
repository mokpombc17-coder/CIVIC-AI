import { describe, expect, it } from "vitest";
import {
  buildVoteSurveySubmission,
  formatStoredSurveyAnswer,
  resolveVoteSurveySubmissionAttempt,
  surveyFieldName,
  surveyOtherFieldName,
  type VoteCurrentSurvey,
  type VoteSurveyQuestion,
} from "./participant-survey";

const questions: readonly VoteSurveyQuestion[] = [
  {
    id: "q-single",
    lineageKey: "l-single",
    type: "SINGLE_CHOICE",
    prompt: "하나를 선택해 주세요.",
    displayOrder: 1,
    required: true,
    rule: {},
    allowOther: false,
    options: [
      {
        id: "single-a",
        lineageKey: "single-a-lineage",
        kind: "STANDARD",
        label: "선택 A",
        displayOrder: 1,
      },
    ],
  },
  {
    id: "q-multiple",
    lineageKey: "l-multiple",
    type: "MULTIPLE_CHOICE",
    prompt: "두 개를 선택해 주세요.",
    displayOrder: 2,
    required: true,
    rule: { minimumSelections: 2, maximumSelections: 2 },
    allowOther: true,
    options: [
      {
        id: "multiple-a",
        lineageKey: "multiple-a-lineage",
        kind: "STANDARD",
        label: "선택 A",
        displayOrder: 1,
      },
      {
        id: "multiple-other",
        lineageKey: "multiple-other-lineage",
        kind: "OTHER",
        label: "기타",
        displayOrder: 2,
      },
    ],
  },
  {
    id: "q-short",
    lineageKey: "l-short",
    type: "SHORT_TEXT",
    prompt: "짧은 답변",
    displayOrder: 3,
    required: true,
    rule: { maxLength: 20 },
    allowOther: false,
    options: [],
  },
  {
    id: "q-long",
    lineageKey: "l-long",
    type: "LONG_TEXT",
    prompt: "긴 답변",
    displayOrder: 4,
    required: true,
    rule: { maxLength: 200 },
    allowOther: false,
    options: [],
  },
  {
    id: "q-number",
    lineageKey: "l-number",
    type: "NUMBER",
    prompt: "숫자 답변",
    displayOrder: 5,
    required: true,
    rule: { minimum: 0, maximum: 100, decimalAllowed: false, decimalScale: 0 },
    allowOther: false,
    options: [],
  },
  {
    id: "q-scale",
    lineageKey: "l-scale",
    type: "SCALE",
    prompt: "척도 답변",
    displayOrder: 6,
    required: true,
    rule: { minimum: 1, maximum: 5, minimumLabel: "낮음", maximumLabel: "높음" },
    allowOther: false,
    options: [],
  },
];

const survey: VoteCurrentSurvey = {
  round: {
    id: "round-1",
    roundNumber: 1,
    contentVersionId: "content-1",
  },
  content: {
    id: "content-1",
    versionNumber: 1,
    name: "사용자 특성 설문",
    questions,
  },
  submitted: false,
  eligibility: {
    eligible: false,
    surveyRequirement: "REQUIRED",
    evaluatedAt: "2026-08-30T00:00:00Z",
    capabilities: [],
  },
};

describe("Vote participant survey contract", () => {
  it("maps all six Vote question types to the exact submission body", () => {
    const form = new FormData();
    form.set(surveyFieldName("q-single", "selection"), "single-a");
    form.append(surveyFieldName("q-multiple", "selection"), "multiple-a");
    form.append(surveyFieldName("q-multiple", "selection"), "multiple-other");
    form.set(surveyOtherFieldName("q-multiple", "multiple-other"), "직접 입력");
    form.set(surveyFieldName("q-short", "text"), "짧은 응답");
    form.set(surveyFieldName("q-long", "text"), "긴 응답입니다.");
    form.set(surveyFieldName("q-number", "number"), "42");
    form.set(surveyFieldName("q-scale", "scale"), "4");

    expect(buildVoteSurveySubmission(survey, form)).toEqual({
      roundId: "round-1",
      answers: [
        {
          questionId: "q-single",
          type: "SINGLE_CHOICE",
          selection: { optionId: "single-a", inputText: null },
        },
        {
          questionId: "q-multiple",
          type: "MULTIPLE_CHOICE",
          selections: [
            { optionId: "multiple-a", inputText: null },
            { optionId: "multiple-other", inputText: "직접 입력" },
          ],
        },
        { questionId: "q-short", type: "SHORT_TEXT", text: "짧은 응답" },
        { questionId: "q-long", type: "LONG_TEXT", text: "긴 응답입니다." },
        { questionId: "q-number", type: "NUMBER", number: 42 },
        { questionId: "q-scale", type: "SCALE", scale: 4 },
      ],
    });
  });

  it("enforces Vote multiple-choice and OTHER rules before submission", () => {
    const form = new FormData();
    form.append(surveyFieldName("q-multiple", "selection"), "multiple-other");
    expect(() => buildVoteSurveySubmission(survey, form)).toThrow("1번 질문에 응답해 주세요.");

    const multipleOnlySurvey = {
      ...survey,
      content: { ...survey.content, questions: [questions[1]!] },
    };
    expect(() => buildVoteSurveySubmission(multipleOnlySurvey, form)).toThrow(
      "1번 질문은 2개 이상 선택해 주세요.",
    );

    form.append(surveyFieldName("q-multiple", "selection"), "multiple-a");
    expect(() => buildVoteSurveySubmission(multipleOnlySurvey, form)).toThrow(
      "1번 질문의 기타 내용을 입력해 주세요.",
    );
  });

  it("omits unanswered optional questions and still validates started answers", () => {
    const optionalText = { ...questions[2]!, required: false };
    const optionalMultiple = { ...questions[1]!, required: false };
    const optionalSurvey = {
      ...survey,
      content: { ...survey.content, questions: [optionalText, optionalMultiple] },
    };
    const empty = new FormData();
    expect(buildVoteSurveySubmission(optionalSurvey, empty)).toEqual({
      roundId: survey.round.id,
      answers: [],
    });

    const started = new FormData();
    started.append(surveyFieldName(optionalMultiple.id, "selection"), "multiple-a");
    expect(() => buildVoteSurveySubmission(optionalSurvey, started)).toThrow(
      "1번 질문은 2개 이상 선택해 주세요.",
    );
  });

  it("reuses one idempotency key for an unchanged canonical submission", () => {
    const submission = { roundId: "round-1", answers: [] };
    const first = resolveVoteSurveySubmissionAttempt(null, submission, () => "key-1");
    const replay = resolveVoteSurveySubmissionAttempt(first, submission, () => "key-2");
    const changed = resolveVoteSurveySubmissionAttempt(
      first,
      { roundId: "round-2", answers: [] },
      () => "key-2",
    );

    expect(replay).toBe(first);
    expect(changed.key).toBe("key-2");
  });

  it("renders stored choice answers using the immutable response content", () => {
    expect(
      formatStoredSurveyAnswer(questions[1]!, {
        questionId: "q-multiple",
        type: "MULTIPLE_CHOICE",
        selections: [
          { optionId: "multiple-a", inputText: null },
          { optionId: "multiple-other", inputText: "직접 입력" },
        ],
      }),
    ).toBe("선택 A, 기타: 직접 입력");
  });
});
