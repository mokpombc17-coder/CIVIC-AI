import { describe, expect, it } from "vitest";
import {
  createSurveyAnswerState,
  validateSurvey,
  validateSurveySection,
} from "./survey-answer-state";
import { SURVEY_MOCK_CONTENT } from "./survey-mock-data";
import { getSurveyQuestions } from "./survey-model";

describe("survey answer state", () => {
  it("creates one empty draft for every mock input", () => {
    const questions = getSurveyQuestions(SURVEY_MOCK_CONTENT);
    const answers = createSurveyAnswerState(SURVEY_MOCK_CONTENT);

    expect(questions).toHaveLength(42);
    expect(Object.keys(answers)).toHaveLength(42);
    expect(answers["demographics.birth-year:value"]).toEqual({ type: "NUMBER", number: null });
  });

  it("validates only the active section while moving between design steps", () => {
    const answers = createSurveyAnswerState(SURVEY_MOCK_CONTENT);
    const firstSection = SURVEY_MOCK_CONTENT.sections[0]!;

    expect(Object.keys(validateSurveySection(firstSection, answers))).toHaveLength(3);
    expect(Object.keys(validateSurvey(SURVEY_MOCK_CONTENT, answers))).toHaveLength(42);
  });
});
