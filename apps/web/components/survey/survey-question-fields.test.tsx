// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  afterEach(() => {
    cleanup();
  });

  it("척도와 행렬 척도에서 이미 고른 값을 다시 누르면 선택을 해제한다", () => {
    const scaleQuestionId = "88888888-8888-4888-8888-888888888888";
    const scaleSection: SurveySection = {
      ...section,
      questions: [
        section.questions[0]!,
        {
          questionId: scaleQuestionId,
          questionKey: "scale",
          title: "만족도",
          prompt: "만족도를 골라 주세요",
          required: false,
          type: "SCALE",
          minimum: 0,
          maximum: 2,
          minimumLabel: "낮음",
          maximumLabel: "높음",
        },
      ],
    };
    const onAnswerChange = vi.fn();
    render(
      <SurveySectionFields
        answers={{
          [QUESTION_ID]: { type: "MATRIX_SCALE", itemAnswers: { [ITEM_ID]: 1 } },
          [scaleQuestionId]: { type: "SCALE", scale: 2 },
        }}
        errors={{}}
        onAnswerChange={onAnswerChange}
        section={scaleSection}
      />,
    );

    fireEvent.click(screen.getAllByRole("radio", { name: "2" }).at(-1)!);
    expect(onAnswerChange).toHaveBeenLastCalledWith(scaleQuestionId, {
      type: "SCALE",
      scale: null,
    });

    fireEvent.click(screen.getAllByRole("radio", { name: "1" })[0]!);
    expect(onAnswerChange).toHaveBeenLastCalledWith(QUESTION_ID, {
      type: "MATRIX_SCALE",
      itemAnswers: { [ITEM_ID]: null },
    });
  });

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
