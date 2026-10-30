import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const llmsTxt = readFileSync(path.join(process.cwd(), "apps/web/public/llms.txt"), "utf8");

describe("llms.txt", () => {
  it("AI 에이전트를 위한 사이트 제목과 공개 페이지 링크를 제공한다", () => {
    expect(llmsTxt.match(/^# .+$/gm)).toEqual(["# CIVIC.AI"]);
    expect(llmsTxt).toContain("[CIVIC.AI 홈](https://example.com/home)");
    expect(llmsTxt).toContain("[사이트맵](https://example.com/sitemap.xml)");
  });
});
