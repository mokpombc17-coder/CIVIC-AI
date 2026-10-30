import { describe, expect, it } from "vitest";
import { isMainDocumentHttpError, shouldAllowWebViewNavigation } from "./load-policy";

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

describe("shouldAllowWebViewNavigation", () => {
  const webAppOrigin = "https://app.example.com";

  it("allows the web app and its blob documents", () => {
    expect(
      shouldAllowWebViewNavigation({
        isTopFrame: true,
        url: "https://app.example.com/survey",
        webAppOrigin,
      }),
    ).toBe(true);
    expect(
      shouldAllowWebViewNavigation({
        isTopFrame: false,
        url: "blob:https://app.example.com/asset",
        webAppOrigin,
      }),
    ).toBe(true);
  });

  it("allows Kakao Postcode only as an embedded frame", () => {
    expect(
      shouldAllowWebViewNavigation({
        isTopFrame: false,
        url: "https://postcode.map.kakao.com/search?q=판교역로",
        webAppOrigin,
      }),
    ).toBe(true);
    expect(
      shouldAllowWebViewNavigation({
        isTopFrame: true,
        url: "https://postcode.map.kakao.com/search?q=판교역로",
        webAppOrigin,
      }),
    ).toBe(false);
  });

  it("blocks unknown embedded and top-level origins", () => {
    expect(
      shouldAllowWebViewNavigation({
        isTopFrame: false,
        url: "https://example.net/frame",
        webAppOrigin,
      }),
    ).toBe(false);
    expect(
      shouldAllowWebViewNavigation({
        isTopFrame: true,
        url: "mailto:test@example.com",
        webAppOrigin,
      }),
    ).toBe(false);
  });
});
