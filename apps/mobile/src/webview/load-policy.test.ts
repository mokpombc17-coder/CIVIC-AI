import { describe, expect, it } from "vitest";
import { isMainDocumentHttpError } from "./load-policy";

describe("isMainDocumentHttpError", () => {
  it("treats an HTTP failure for the current page as fatal", () => {
    expect(
      isMainDocumentHttpError(
        "https://app.example.com/architecture",
        "https://app.example.com/architecture",
      ),
    ).toBe(true);
  });

  it("ignores asset failures so the shell does not cover an otherwise usable page", () => {
    expect(
      isMainDocumentHttpError(
        "https://app.example.com/_next/static/chunks/app.js",
        "https://app.example.com/architecture",
      ),
    ).toBe(false);
  });

  it("ignores URL fragments when identifying the current document", () => {
    expect(
      isMainDocumentHttpError(
        "https://app.example.com/architecture",
        "https://app.example.com/architecture#component-tree",
      ),
    ).toBe(true);
  });
});
