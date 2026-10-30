export const CIVIC_BROWSER_SUPPORT = {
  ios: [16, 4],
  safari: [16, 4],
  chrome: 111,
  edge: 111,
  firefox: 111,
} as const;

export type BrowserSupport = "supported" | "unsupported" | "unknown";

export type BrowserEnvironment = {
  os?: {
    name: "iOS" | "iPadOS";
    version?: string;
  };
  browser?: {
    name: "Safari" | "Chrome" | "Edge" | "Firefox";
    version?: string;
  };
};

export type UnsupportedBrowserReason =
  "ios-version" | "safari-version" | "chrome-version" | "edge-version" | "firefox-version";

export type BrowserSupportResult =
  | {
      support: "supported";
      environment: BrowserEnvironment;
    }
  | {
      support: "unsupported";
      environment: BrowserEnvironment;
      reason: UnsupportedBrowserReason;
    }
  | {
      support: "unknown";
      environment: BrowserEnvironment;
    };

type Version = readonly [major: number, minor: number];

const BOT_PATTERN =
  /(?:bot|crawler|spider|slurp|bingpreview|facebookexternalhit|google-structured-data-testing-tool)\b/iu;
const IOS_DEVICE_PATTERN = /\b(?:iPhone|iPad|iPod)\b/u;
const IPAD_PATTERN = /\biPad\b/u;
const IPAD_DESKTOP_MODE_PATTERN = /\bMacintosh\b.*\bMobile\//u;
const IOS_VERSION_PATTERN = /\b(?:CPU(?: iPhone)? OS|iPhone OS) (\d+)(?:[._](\d+))?/u;
const ALTERNATIVE_CHROMIUM_PATTERN =
  /\b(?:OPR|Opera|SamsungBrowser|UCBrowser|YaBrowser|Vivaldi)\//u;
const ANDROID_WEBVIEW_PATTERN = /(?:;\s*wv\)|\bVersion\/4\.0\b.*\bChrome\/)/u;

function compareVersion([major, minor]: Version, [minimumMajor, minimumMinor]: Version) {
  if (major !== minimumMajor) {
    return major - minimumMajor;
  }

  return minor - minimumMinor;
}

function toVersion(match: RegExpMatchArray | null): Version | null {
  if (!match?.[1]) {
    return null;
  }

  return [Number(match[1]), Number(match[2] ?? 0)];
}

function formatVersion([major, minor]: Version): string {
  return `${major}.${minor}`;
}

function unknown(environment: BrowserEnvironment = {}): BrowserSupportResult {
  return { support: "unknown", environment };
}

function classifyVersion(
  version: Version | null,
  minimum: Version,
  environment: BrowserEnvironment,
  reason: UnsupportedBrowserReason,
): BrowserSupportResult {
  if (!version) {
    return unknown(environment);
  }

  return compareVersion(version, minimum) >= 0
    ? { support: "supported", environment }
    : { support: "unsupported", environment, reason };
}

function classifyMajorVersion(
  match: RegExpMatchArray,
  minimumMajor: number,
  browserName: NonNullable<BrowserEnvironment["browser"]>["name"],
  reason: UnsupportedBrowserReason,
): BrowserSupportResult {
  const version = match[1];
  const environment: BrowserEnvironment = {
    browser: {
      name: browserName,
      ...(version ? { version } : {}),
    },
  };

  if (!version) {
    return unknown(environment);
  }

  return Number(version) >= minimumMajor
    ? { support: "supported", environment }
    : { support: "unsupported", environment, reason };
}

export function classifyBrowserSupport(userAgent: string): BrowserSupportResult {
  const normalizedUserAgent = userAgent.trim();

  if (!normalizedUserAgent || BOT_PATTERN.test(normalizedUserAgent)) {
    return unknown();
  }

  if (IPAD_DESKTOP_MODE_PATTERN.test(normalizedUserAgent)) {
    return unknown();
  }

  if (IOS_DEVICE_PATTERN.test(normalizedUserAgent)) {
    const version = toVersion(normalizedUserAgent.match(IOS_VERSION_PATTERN));
    const osName = IPAD_PATTERN.test(normalizedUserAgent) ? "iPadOS" : "iOS";
    const environment: BrowserEnvironment = {
      os: {
        name: osName,
        ...(version ? { version: formatVersion(version) } : {}),
      },
    };

    return classifyVersion(version, CIVIC_BROWSER_SUPPORT.ios, environment, "ios-version");
  }

  const edge = normalizedUserAgent.match(/\bEdgA?\/(\d+)/u);
  if (edge) {
    return classifyMajorVersion(edge, CIVIC_BROWSER_SUPPORT.edge, "Edge", "edge-version");
  }

  const firefox = normalizedUserAgent.match(/\bFirefox\/(\d+)/u);
  if (firefox) {
    return classifyMajorVersion(
      firefox,
      CIVIC_BROWSER_SUPPORT.firefox,
      "Firefox",
      "firefox-version",
    );
  }

  if (
    ANDROID_WEBVIEW_PATTERN.test(normalizedUserAgent) ||
    ALTERNATIVE_CHROMIUM_PATTERN.test(normalizedUserAgent)
  ) {
    return unknown();
  }

  const chrome = normalizedUserAgent.match(/\b(?:Chrome|Chromium)\/(\d+)/u);
  if (chrome) {
    return classifyMajorVersion(chrome, CIVIC_BROWSER_SUPPORT.chrome, "Chrome", "chrome-version");
  }

  const safari = normalizedUserAgent.match(/\bVersion\/(\d+)(?:\.(\d+))?.*\bSafari\//u);
  if (safari) {
    const version = toVersion(safari);
    const environment: BrowserEnvironment = {
      browser: {
        name: "Safari",
        ...(version ? { version: formatVersion(version) } : {}),
      },
    };

    return classifyVersion(version, CIVIC_BROWSER_SUPPORT.safari, environment, "safari-version");
  }

  return unknown();
}
