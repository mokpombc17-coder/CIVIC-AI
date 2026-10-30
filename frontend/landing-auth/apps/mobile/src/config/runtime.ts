const rawWebAppUrl = process.env.EXPO_PUBLIC_WEB_APP_URL ?? "http://localhost:3000";

export const IS_DEVELOPMENT =
  typeof __DEV__ === "boolean" ? __DEV__ : process.env.NODE_ENV !== "production";
export const WEB_APP_URL = normalizeWebAppUrl(rawWebAppUrl);
export const WEB_APP_ORIGIN = new URL(WEB_APP_URL).origin;
export const NATIVE_SCHEME = normalizeScheme(process.env.EXPO_PUBLIC_APP_SCHEME);
export const OAUTH_ENABLED = readBoolean("EXPO_PUBLIC_OAUTH_ENABLED", false);
export const DOWNLOADS_ENABLED = readBoolean("EXPO_PUBLIC_DOWNLOADS_ENABLED", true);
export const PUSH_ENABLED = readBoolean("EXPO_PUBLIC_PUSH_ENABLED", false);
export const DOWNLOAD_ORIGINS = new Set([
  WEB_APP_ORIGIN,
  ...readOrigins(process.env.EXPO_PUBLIC_DOWNLOAD_ORIGINS),
]);

function normalizeWebAppUrl(value: string): string {
  const parsed = new URL(value);

  if (!(["http:", "https:"] as const).includes(parsed.protocol as "http:" | "https:")) {
    throw new Error("EXPO_PUBLIC_WEB_APP_URL must use http or https.");
  }

  if (!IS_DEVELOPMENT && parsed.protocol !== "https:") {
    throw new Error("Production WebView origin must use HTTPS.");
  }

  return parsed.toString().replace(/\/$/, "");
}

function normalizeScheme(value: string | undefined): string {
  const scheme = value?.trim().toLowerCase() || "nextwebview";
  if (!/^[a-z][a-z0-9+.-]*$/.test(scheme)) {
    throw new Error("EXPO_PUBLIC_APP_SCHEME must be a valid URL scheme.");
  }

  return scheme;
}

function readBoolean(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) {
    return fallback;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }

  throw new Error(`${name} must be either "true" or "false".`);
}

function readOrigins(value: string | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }

  return value.split(",").map((item) => {
    const url = new URL(item.trim());
    if (!IS_DEVELOPMENT && url.protocol !== "https:") {
      throw new Error("EXPO_PUBLIC_DOWNLOAD_ORIGINS must use HTTPS in production.");
    }
    return url.origin;
  });
}
