import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SurveySelect } from "./survey-select";

const options = [
  { value: "A", label: "남성" },
  { value: "B", label: "여성" },
] as const;

describe("SurveySelect", () => {
  it("renders a reusable select-only combobox with a chevron", () => {
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
});
