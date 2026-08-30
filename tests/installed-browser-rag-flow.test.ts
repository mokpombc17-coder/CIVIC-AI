import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const repository = new URL("../", import.meta.url);

describe("installed browser RAG flow", () => {
  it("Chrome evidence verifies the inline citation dialog without route navigation", () => {
    const source = readFileSync(
      new URL("e2e/actual/installed-browser-smoke.spec.ts", repository),
      "utf8",
    );

    expect(source).toContain('data-wireflow-screen="U-RAG-001"');
    expect(source).toContain('getByRole("button", { name: "새 질문" })');
    expect(source).toContain('getByText("새 질문을 시작했습니다.")');
    expect(source).toContain('getByRole("dialog", { name: "참조 문서" })');
    expect(source).toContain("toHaveURL(/\\/rag$/)");
    expect(source).not.toContain('data-wireflow-screen="U-RAG-002"');
  });

  it("Safari evidence uses the current composer and inline citation dialog", () => {
    const source = readFileSync(
      new URL("scripts/run-installed-safari-smoke.mjs", repository),
      "utf8",
    );

    expect(source).toContain('textarea[placeholder="문서에 대해 질문하세요…"]');
    expect(source).toContain(".civic-rag-session-bar button.civic-secondary-action");
    expect(source).toContain('[data-wireflow-screen="U-RAG-001"]');
    expect(source).toContain('[role="dialog"][aria-label="참조 문서"]');
    expect(source).not.toContain('data-wireflow-screen="U-RAG-002"');
  });
});
