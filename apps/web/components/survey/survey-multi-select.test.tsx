import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createSelectionSummary, SurveyMultiSelect } from "./survey-multi-select";

const options = [
  { value: "A", label: "드라마/영화" },
  { value: "B", label: "여행" },
  { value: "C", label: "경제/재테크" },
  { value: "D", label: "기타", disabled: true },
] as const;

describe("SurveyMultiSelect", () => {
  it("shares the dropdown surface and renders plain checkbox rows", () => {
    const html = renderToStaticMarkup(
      <SurveyMultiSelect
        ariaLabel="관심 주제"
        id="topics"
        onChange={() => undefined}
        options={options}
        values={["A", "B", "C"]}
      />,
    );

    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("드라마/영화, 여행 외 1개");
    expect(html).not.toContain("1)");
    expect(html).toContain('data-selected="true"');
    expect(html).toContain('data-disabled="true"');
    expect(html).toContain('data-option-index="0"');
    expect(html).toContain('tabindex="-1"');
  });

  it("compresses more than two selected labels", () => {
    expect(createSelectionSummary(["A", "B", "C", "D"], "선택")).toBe("A, B 외 2개");
    expect(createSelectionSummary([], "선택")).toBe("선택");
  });
});
