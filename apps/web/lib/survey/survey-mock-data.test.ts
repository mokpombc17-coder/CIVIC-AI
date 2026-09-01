import { describe, expect, it } from "vitest";
import { SURVEY_MOCK_CONTENT } from "./survey-mock-data";
import { getSurveyQuestions } from "./survey-model";

describe("survey mock data", () => {
  it("preserves the Figma flow shape", () => {
    const sections = SURVEY_MOCK_CONTENT.sections;
    const groups = sections.flatMap((section) => section.groups);
    const questions = getSurveyQuestions(SURVEY_MOCK_CONTENT);

    expect(sections).toHaveLength(7);
    expect(groups).toHaveLength(29);
    expect(questions).toHaveLength(42);
    expect(new Set(questions.map((question) => question.questionId)).size).toBe(42);
  });
});
