import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SurveySelect } from "./survey-select";

const options = [
  { value: "A", label: "남성" },
  { value: "B", label: "여성" },
] as const;

describe("SurveySelect", () => {
  it("renders a reusable select-only combobox with an animated ordinal menu", () => {
    const html = renderToStaticMarkup(
      <SurveySelect
        ariaLabel="성별"
        id="gender"
        onChange={() => undefined}
        options={options}
        value={null}
      />,
    );

    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('data-empty="true"');
    expect(html).toContain("선택");
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('data-open="false"');
    expect(html).toContain("위의 선택지 더 보기");
    expect(html).toContain("아래의 선택지 더 보기");
    expect(html).toContain("1)");
  });

  it("renders the selected option label", () => {
    const html = renderToStaticMarkup(
      <SurveySelect
        ariaLabel="성별"
        id="gender"
        onChange={() => undefined}
        options={options}
        value="B"
      />,
    );

    expect(html).toContain("여성");
    expect(html).toContain('title="여성"');
    expect(html).not.toContain('data-empty="true"');
  });

  it("keeps bounded number options plain", () => {
    const html = renderToStaticMarkup(
      <SurveySelect
        ariaLabel="출생연도"
        id="birth-year"
        onChange={() => undefined}
        optionLabelMode="plain"
        options={[{ value: "2026", label: "2026" }]}
        value={null}
      />,
    );

    expect(html).toContain("2026");
    expect(html).not.toContain("1)");
  });
});
