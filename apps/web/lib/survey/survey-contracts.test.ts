import { describe, expect, it } from "vitest";
import {
  currentSurveyResponseSchema,
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

  it("Section 원본을 변경하지 않고 displayOrder로 정렬한다", () => {
    const section = currentSurveyFixture.content.sections[0]!;
    const reversed = [
      { ...section, sectionId: "00000000-0000-4000-8000-000000000999", displayOrder: 2 },
      section,
    ];

    expect(sortSurveySections(reversed).map((item) => item.displayOrder)).toEqual([1, 2]);
    expect(reversed.map((item) => item.displayOrder)).toEqual([2, 1]);
  });
});
