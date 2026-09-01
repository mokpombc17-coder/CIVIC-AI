import { describe, expect, it } from "vitest";
import {
  currentSurveyResponseSchema,
  getSurveyQuestionLabel,
  getSurveyQuestions,
  sortSurveySections,
} from "./survey-contracts";
import { currentSurveyFixture } from "./survey-test-fixtures";

describe("survey contracts", () => {
  it("Section → Group → Question 계약을 검증한다", () => {
    const parsed = currentSurveyResponseSchema.parse(currentSurveyFixture);

    expect(parsed.content.sections).toHaveLength(1);
    expect(getSurveyQuestions(parsed.content)).toHaveLength(6);
  });

  it("이전 groups-only 콘텐츠 응답은 허용하지 않는다", () => {
    const legacy = {
      ...currentSurveyFixture,
      content: {
        ...currentSurveyFixture.content,
        sections: undefined,
        groups: currentSurveyFixture.content.sections[0]?.groups,
      },
    };

    expect(() => currentSurveyResponseSchema.parse(legacy)).toThrow();
  });

  it("단일 Question의 null itemLabel을 허용하고 Group prompt를 표시한다", () => {
    const section = currentSurveyFixture.content.sections[0]!;
    const group = section.groups[0]!;
    const question = group.questions[0]!;
    const response = {
      ...currentSurveyFixture,
      content: {
        ...currentSurveyFixture.content,
        sections: [
          {
            ...section,
            groups: [
              {
                ...group,
                questions: [{ ...question, itemLabel: null }],
              },
              ...section.groups.slice(1),
            ],
          },
        ],
      },
    };

    const parsed = currentSurveyResponseSchema.parse(response);
    const parsedGroup = parsed.content.sections[0]!.groups[0]!;

    expect(getSurveyQuestionLabel(parsedGroup, parsedGroup.questions[0]!)).toBe(group.prompt);
  });

  it("Section 원본을 변경하지 않고 displayOrder로 정렬한다", () => {
    const section = currentSurveyFixture.content.sections[0]!;
    const reversed = [{ ...section, sectionKey: "second-section", displayOrder: 2 }, section];

    expect(sortSurveySections(reversed).map((item) => item.displayOrder)).toEqual([1, 2]);
    expect(reversed.map((item) => item.displayOrder)).toEqual([2, 1]);
  });
});
