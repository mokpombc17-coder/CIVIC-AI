import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, isBrowserSupportBypassPath, isDocumentNavigation, proxy } from "../proxy";

const IOS_13_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 13_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.2 Mobile/15E148 Safari/604.1";
const IOS_16_4_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Mobile/15E148 Safari/604.1";

function createNavigationRequest(
  pathname: string,
  userAgent: string,
  extraHeaders: Record<string, string> = {},
) {
  return new NextRequest(`https://civic.example${pathname}`, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "sec-fetch-dest": "document",
      "user-agent": userAgent,
      ...extraHeaders,
    },
  });
}

describe("unsupported browser proxy gate", () => {
  it("redirects a clearly unsupported document navigation to the route handler", () => {
    const response = proxy(createNavigationRequest("/home?source=test", IOS_13_SAFARI));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://civic.example/unsupported-browser");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("User-Agent");
  });

  it("lets supported and unknown browsers continue", () => {
    for (const userAgent of [IOS_16_4_SAFARI, "CIVIC-Test-Browser/1.0"]) {
      const response = proxy(createNavigationRequest("/home", userAgent));

      expect(response.status).toBe(200);
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(response.headers.get("content-security-policy")).toContain("default-src 'self'");
    }
  });

  it("does not gate non-document requests from an unsupported browser", () => {
    const request = new NextRequest("https://civic.example/home", {
      headers: {
        accept: "text/x-component",
        "sec-fetch-dest": "empty",
        "user-agent": IOS_13_SAFARI,
      },
    });

    expect(isDocumentNavigation(request)).toBe(false);
    expect(proxy(request).status).toBe(200);
  });

  it.each([
    "/api/v1/tasks",
    "/_next/static/chunks/app.js",
    "/sw.js",
    "/manifest.webmanifest",
    "/unsupported-browser",
    "/unsupported-browser/",
    "/unsupported-browser.css",
    "/assets/platform-navigation/home.png",
  ])("bypasses infrastructure and static paths without a redirect loop: %s", (pathname) => {
    expect(isBrowserSupportBypassPath(pathname)).toBe(true);
    expect(proxy(createNavigationRequest(pathname, IOS_13_SAFARI)).status).toBe(200);
  });

  it("excludes infrastructure, the guide endpoint, static files, and prefetch from the matcher", () => {
    const serializedMatcher = JSON.stringify(config.matcher);

    expect(serializedMatcher).toContain("api|_next|");
    expect(serializedMatcher).toContain("sw\\\\.js");
    expect(serializedMatcher).toContain("unsupported-browser(?:/|$)");
    expect(serializedMatcher).toContain("next-router-prefetch");
    expect(serializedMatcher).toContain('"purpose","value":"prefetch"');
  });
});
