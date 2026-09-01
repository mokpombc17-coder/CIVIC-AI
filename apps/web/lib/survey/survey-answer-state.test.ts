import { describe, expect, it } from "vitest";
import {
  createSubmitSurveyRequest,
  createSurveyAnswerState,
  validateSurvey,
  type SurveyAnswerState,
} from "./survey-answer-state";
import { currentSurveyFixture, surveyQuestionFixtures } from "./survey-test-fixtures";

describe("survey answer state", () => {
  it("모든 Question type을 questionId 기준 제출 payload로 변환한다", () => {
    const answers: SurveyAnswerState = {
      [surveyQuestionFixtures.single.questionId]: {
        type: "SINGLE_CHOICE",
        selection: {
          optionId: surveyQuestionFixtures.single.options[0]!.optionId,
          inputText: "무시할 값",
        },
      },
      [surveyQuestionFixtures.multiple.questionId]: {
        type: "MULTIPLE_CHOICE",
        selections: [
          { optionId: surveyQuestionFixtures.multiple.options[1]!.optionId, inputText: "" },
        ],
      },
      [surveyQuestionFixtures.shortText.questionId]: { type: "SHORT_TEXT", text: " 짧은 답변 " },
      [surveyQuestionFixtures.longText.questionId]: { type: "LONG_TEXT", text: "긴 답변" },
      [surveyQuestionFixtures.number.questionId]: { type: "NUMBER", number: 1990 },
      [surveyQuestionFixtures.scale.questionId]: { type: "SCALE", scale: 7 },
    };

    const payload = createSubmitSurveyRequest(
      currentSurveyFixture.round.id,
      currentSurveyFixture.content,
      answers,
    );

    expect(payload.answers).toHaveLength(6);
    expect(payload.answers[0]).toMatchObject({
      questionId: surveyQuestionFixtures.single.questionId,
      selection: { inputText: null },
    });
    expect(payload.answers[2]).toMatchObject({ text: "짧은 답변" });
  });

  it("필수 답변과 rule 위반을 Question별 오류로 반환한다", () => {
    const answers = createSurveyAnswerState(currentSurveyFixture.content);
    const errors = validateSurvey(currentSurveyFixture.content, answers);

    expect(Object.keys(errors)).toHaveLength(6);
    expect(errors[surveyQuestionFixtures.multiple.questionId]).toBe("1개 이상 선택해 주세요.");
  });

  it("OTHER 선택지는 입력 문구가 있어야 한다", () => {
    const answers = {
      ...createSurveyAnswerState(currentSurveyFixture.content),
      [surveyQuestionFixtures.single.questionId]: {
        type: "SINGLE_CHOICE" as const,
        selection: {
          optionId: surveyQuestionFixtures.single.options[1]!.optionId,
          inputText: " ",
        },
      },
    };

    expect(
      validateSurvey(currentSurveyFixture.content, answers)[
        surveyQuestionFixtures.single.questionId
      ],
    ).toBe("기타 내용을 입력해 주세요.");
  });
});
