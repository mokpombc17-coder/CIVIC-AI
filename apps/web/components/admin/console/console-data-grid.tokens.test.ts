import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// console-data-grid.tsx는 CSP 때문에 --wf-* 토큰 값을 리터럴로 복제한다.
// 토큰이 바뀌었는데 그리드 리터럴이 안 따라오면 여기서 잡는다.

const webRoot = join(__dirname, "..", "..", "..");

function tokenValue(css: string, name: string): string {
  const match = css.match(new RegExp(`${name}:\\s*([^;]+);`));
  if (!match?.[1]) throw new Error(`wireflow.css에서 ${name} 토큰을 찾지 못했습니다.`);
  return match[1].trim();
}

describe("console-data-grid theme literals", () => {
  const wireflow = readFileSync(join(webRoot, "app", "wireflow.css"), "utf8");
  const grid = readFileSync(join(__dirname, "console-data-grid.tsx"), "utf8");

  it.each([
    ["accentColor", "--wf-blue"],
    ["borderColor", "--wf-line"],
    ["foregroundColor", "--wf-ink"],
    ["headerTextColor", "--wf-muted"],
    ["rowHoverColor", "--wf-blue-soft"],
    ["selectedRowBackgroundColor", "--wf-blue-soft"],
  ])("%s literal matches %s token", (param, token) => {
    const literal = grid.match(new RegExp(`${param}:\\s*"([^"]+)"`))?.[1];
    expect(literal, `${param} 리터럴을 찾지 못했습니다.`).toBeDefined();
    expect(literal?.toLowerCase()).toBe(tokenValue(wireflow, token).toLowerCase());
  });

  it("fontFamily literal matches --wf-font token", () => {
    const literal = grid.match(/fontFamily:\s*'([^']+)'/)?.[1];
    expect(literal).toBe(tokenValue(wireflow, "--wf-font"));
  });
});
