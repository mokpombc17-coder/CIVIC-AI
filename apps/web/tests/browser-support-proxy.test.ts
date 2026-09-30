import { readFile } from "node:fs/promises";
import path from "node:path";
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
  it("redirects a clearly unsupported document navigation to the static guide", () => {
    const response = proxy(createNavigationRequest("/home?source=test", IOS_13_SAFARI));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://civic.example/unsupported-browser.html");
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
    "/unsupported-browser.html",
    "/unsupported-browser.css",
    "/assets/platform-navigation/home.png",
  ])("bypasses infrastructure and static paths without a redirect loop: %s", (pathname) => {
    expect(isBrowserSupportBypassPath(pathname)).toBe(true);
    expect(proxy(createNavigationRequest(pathname, IOS_13_SAFARI)).status).toBe(200);
  });

  it("excludes infrastructure, static files, and prefetch from the matcher", () => {
    const serializedMatcher = JSON.stringify(config.matcher);

    expect(serializedMatcher).toContain("api|_next|");
    expect(serializedMatcher).toContain("sw\\\\.js");
    expect(serializedMatcher).toContain("unsupported-browser\\\\.");
    expect(serializedMatcher).toContain("next-router-prefetch");
    expect(serializedMatcher).toContain('"purpose","value":"prefetch"');
  });

  it("keeps the static guide independent while matching the home header brand", async () => {
    const [guide, guideStyles] = await Promise.all([
      readFile(path.join(process.cwd(), "apps/web/public/unsupported-browser.html"), "utf8"),
      readFile(path.join(process.cwd(), "apps/web/public/unsupported-browser.css"), "utf8"),
    ]);

    expect(guide).toContain('class="civic-home-brand"');
    expect(guide).toContain('class="civic-brand-title">CIVIC.AI');
    expect(guide).toContain('class="civic-region-badge">전남광주');
    expect(guide).toContain('class="platform-stage"');
    expect(guide).toContain('class="platform-shell"');
    expect(guide).toContain('class="platform-surface"');
    expect(guide).toContain('class="browser-support-card"');
    expect(guide).toContain("기기 소프트웨어 또는 브라우저를 업데이트해 주세요");
    expect(guide).toContain("업데이트 후 CIVIC.AI에 다시 접속해 주세요.");
    expect(guide).toContain(
      "지원 기준: iOS·iPadOS 및 Safari 16.4 이상 · Chrome·Edge·Firefox 111 이상",
    );
    expect(guide).not.toContain("retry-link");
    expect(guide).not.toContain("notice-mark");
    expect(guide).not.toContain("<script");
    expect(guideStyles).toContain('font-family: "Pretendard GOV"');
    expect(guideStyles).toContain(
      "radial-gradient(circle at 10% 0%, rgba(74, 113, 255, 0.13), transparent 30rem)",
    );
    expect(guideStyles).toContain("max-width: 393px");
    expect(guideStyles).toContain("gap: 7px");
    expect(guideStyles).toContain("letter-spacing: -0.6px");
  });
});
