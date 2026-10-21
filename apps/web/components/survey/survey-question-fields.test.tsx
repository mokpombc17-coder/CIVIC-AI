import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SurveySection } from "@/lib/survey/survey-contracts";
import { SurveySectionFields } from "./survey-question-fields";

const QUESTION_ID = "44444444-4444-4444-8444-444444444444";
const ITEM_ID = "55555555-5555-4555-8555-555555555555";

const section: SurveySection = {
  sectionKey: "section-one",
  title: "첫 번째",
  questions: [
    {
      questionId: QUESTION_ID,
      questionKey: "matrix",
      title: "행렬 척도",
      prompt: "평가해 주세요",
      required: true,
      type: "MATRIX_SCALE",
      items: [{ itemId: ITEM_ID, itemKey: "item", itemLabel: "항목" }],
      minimum: 0,
      maximum: 10,
      minimumLabel: null,
      maximumLabel: null,
    },
  ],
};

describe("SurveySectionFields", () => {
  it("marks the selected matrix scale option for CSS compatibility", () => {
    const html = renderToStaticMarkup(
      <SurveySectionFields
        answers={{
          [QUESTION_ID]: { type: "MATRIX_SCALE", itemAnswers: { [ITEM_ID]: 7 } },
        }}
        errors={{}}
        onAnswerChange={() => undefined}
        section={section}
      />,
    );

    expect(html.match(/data-selected="true"/g)).toHaveLength(1);
    expect(html).toMatch(/<label[^>]*data-selected="true"[^>]*><input[^>]*checked=""/);
  });

  it("shows the 선택 문항 label only for optional questions", () => {
    const optionalSection: SurveySection = {
      ...section,
      questions: [
        section.questions[0]!,
        {
          questionId: "66666666-6666-4666-8666-666666666666",
          questionKey: "optional",
          title: "종교",
          prompt: "골라 주세요",
          required: false,
          type: "SINGLE_CHOICE",
          options: [{ optionId: "77777777-7777-4777-8777-777777777777", label: "예" }],
        },
      ],
    };
    const html = renderToStaticMarkup(
      <SurveySectionFields
        answers={{}}
        errors={{}}
        onAnswerChange={() => undefined}
        section={optionalSection}
      />,
    );

    expect(html).toContain("<h3>행렬 척도</h3>");
    expect(html).toMatch(/<h3>종교 <span[^>]*>선택 문항<\/span><\/h3>/);
  });
});
