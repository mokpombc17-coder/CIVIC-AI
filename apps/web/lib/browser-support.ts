export const CIVIC_BROWSER_SUPPORT = {
  ios: [16, 4],
  safari: [16, 4],
  chrome: 111,
  edge: 111,
  firefox: 111,
} as const;

export type BrowserSupport = "supported" | "unsupported" | "unknown";

type Version = readonly [major: number, minor: number];

const BOT_PATTERN =
  /(?:bot|crawler|spider|slurp|bingpreview|facebookexternalhit|google-structured-data-testing-tool)\b/iu;
const IOS_DEVICE_PATTERN = /\b(?:iPhone|iPad|iPod)\b/u;
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

function classifyVersion(version: Version | null, minimum: Version): BrowserSupport {
  if (!version) {
    return "unknown";
  }

  return compareVersion(version, minimum) >= 0 ? "supported" : "unsupported";
}

function classifyMajorVersion(
  match: RegExpMatchArray | null,
  minimumMajor: number,
): BrowserSupport {
  if (!match?.[1]) {
    return "unknown";
  }

  return Number(match[1]) >= minimumMajor ? "supported" : "unsupported";
}

export function classifyBrowserSupport(userAgent: string): BrowserSupport {
  const normalizedUserAgent = userAgent.trim();

  if (!normalizedUserAgent || BOT_PATTERN.test(normalizedUserAgent)) {
    return "unknown";
  }

  if (IPAD_DESKTOP_MODE_PATTERN.test(normalizedUserAgent)) {
    return "unknown";
  }

  if (IOS_DEVICE_PATTERN.test(normalizedUserAgent)) {
    return classifyVersion(
      toVersion(normalizedUserAgent.match(IOS_VERSION_PATTERN)),
      CIVIC_BROWSER_SUPPORT.ios,
    );
  }

  const edge = normalizedUserAgent.match(/\bEdgA?\/(\d+)/u);
  if (edge) {
    return classifyMajorVersion(edge, CIVIC_BROWSER_SUPPORT.edge);
  }

  const firefox = normalizedUserAgent.match(/\bFirefox\/(\d+)/u);
  if (firefox) {
    return classifyMajorVersion(firefox, CIVIC_BROWSER_SUPPORT.firefox);
  }

  if (
    ANDROID_WEBVIEW_PATTERN.test(normalizedUserAgent) ||
    ALTERNATIVE_CHROMIUM_PATTERN.test(normalizedUserAgent)
  ) {
    return "unknown";
  }

  const chrome = normalizedUserAgent.match(/\b(?:Chrome|Chromium)\/(\d+)/u);
  if (chrome) {
    return classifyMajorVersion(chrome, CIVIC_BROWSER_SUPPORT.chrome);
  }

  const safari = normalizedUserAgent.match(/\bVersion\/(\d+)(?:\.(\d+))?.*\bSafari\//u);
  if (safari) {
    return classifyVersion(toVersion(safari), CIVIC_BROWSER_SUPPORT.safari);
  }

  return "unknown";
}
