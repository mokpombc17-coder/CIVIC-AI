import { describe, expect, it } from "vitest";
import { classifyBrowserSupport } from "./browser-support";

const USER_AGENTS = {
  ios13Safari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 13_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.2 Mobile/15E148 Safari/604.1",
  ios13Chrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 13_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.7339.122 Mobile/15E148 Safari/604.1",
  ios164Safari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Mobile/15E148 Safari/604.1",
  ipad13Safari:
    "Mozilla/5.0 (iPad; CPU OS 13_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.2 Mobile/15E148 Safari/604.1",
  ipad164Safari:
    "Mozilla/5.0 (iPad; CPU OS 16_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Mobile/15E148 Safari/604.1",
  ipadDesktopMode:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Mobile/15E148 Safari/604.1",
  safari163:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Safari/605.1.15",
  safari164:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Safari/605.1.15",
  chrome110:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36",
  chrome111:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36",
  edge110:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36 Edg/110.0.1587.57",
  edge111:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36 Edg/111.0.1661.44",
  firefox110: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:110.0) Gecko/20100101 Firefox/110.0",
  firefox111: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:111.0) Gecko/20100101 Firefox/111.0",
  opera:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36 OPR/96.0.0.0",
  googlebot: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  modernGooglebot:
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1) Chrome/140.0.0.0 Safari/537.36",
} as const;

describe("classifyBrowserSupport", () => {
  it.each([
    USER_AGENTS.ios13Safari,
    USER_AGENTS.ios13Chrome,
    USER_AGENTS.ipad13Safari,
    USER_AGENTS.safari163,
    USER_AGENTS.chrome110,
    USER_AGENTS.edge110,
    USER_AGENTS.firefox110,
  ])("classifies a clearly lower version as unsupported", (userAgent) => {
    expect(classifyBrowserSupport(userAgent).support).toBe("unsupported");
  });

  it.each([
    USER_AGENTS.ios164Safari,
    USER_AGENTS.ipad164Safari,
    USER_AGENTS.safari164,
    USER_AGENTS.chrome111,
    USER_AGENTS.edge111,
    USER_AGENTS.firefox111,
  ])("classifies a browser at the service baseline as supported", (userAgent) => {
    expect(classifyBrowserSupport(userAgent).support).toBe("supported");
  });

  it.each([
    "",
    USER_AGENTS.ipadDesktopMode,
    USER_AGENTS.opera,
    USER_AGENTS.googlebot,
    USER_AGENTS.modernGooglebot,
    "CIVIC-Test-Browser/1.0",
  ])("allows uncertain environments to remain unknown", (userAgent) => {
    expect(classifyBrowserSupport(userAgent).support).toBe("unknown");
  });

  it("reports iOS as the reason even when the browser app version looks current", () => {
    expect(classifyBrowserSupport(USER_AGENTS.ios13Chrome)).toEqual({
      support: "unsupported",
      environment: {
        os: {
          name: "iOS",
          version: "13.7",
        },
      },
      reason: "ios-version",
    });
  });

  it("distinguishes an iPadOS environment", () => {
    expect(classifyBrowserSupport(USER_AGENTS.ipad13Safari)).toEqual({
      support: "unsupported",
      environment: {
        os: {
          name: "iPadOS",
          version: "13.7",
        },
      },
      reason: "ios-version",
    });
  });

  it.each([
    [USER_AGENTS.safari163, "Safari", "16.3", "safari-version"],
    [USER_AGENTS.chrome110, "Chrome", "110", "chrome-version"],
    [USER_AGENTS.edge110, "Edge", "110", "edge-version"],
    [USER_AGENTS.firefox110, "Firefox", "110", "firefox-version"],
  ] as const)(
    "reports the normalized browser and blocking reason",
    (userAgent, name, version, reason) => {
      expect(classifyBrowserSupport(userAgent)).toEqual({
        support: "unsupported",
        environment: {
          browser: { name, version },
        },
        reason,
      });
    },
  );
});
