import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { isTrustedBrowserRequest } from "./browser-request-boundary";

describe("browser mutation origin boundary", () => {
  it("rejects cookie-sending requests from another port or site", () => {
    for (const headers of [
      { origin: "https://civic.example:444", "sec-fetch-site": "same-site" },
      { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
      { origin: "https://civic.example" },
    ]) {
      const request = new NextRequest("https://civic.example/api/v1/account/profile", {
        method: "PATCH",
        headers,
      });
      expect(isTrustedBrowserRequest(request, "https://civic.example")).toBe(false);
    }
  });

  it("accepts exact-origin mutations and does not require mutation metadata for reads", () => {
    const mutation = new NextRequest("https://civic.example/api/v1/account/profile", {
      method: "PATCH",
      headers: { origin: "https://civic.example", "sec-fetch-site": "same-origin" },
    });
    const read = new NextRequest("https://civic.example/api/v1/account/profile");

    expect(isTrustedBrowserRequest(mutation, "https://civic.example")).toBe(true);
    expect(isTrustedBrowserRequest(read, "https://civic.example")).toBe(true);
  });
});
