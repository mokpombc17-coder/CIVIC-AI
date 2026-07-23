const rawWebAppUrl = process.env.EXPO_PUBLIC_WEB_APP_URL ?? "http://localhost:3000";

export const WEB_APP_URL = normalizeWebAppUrl(rawWebAppUrl);
export const WEB_APP_ORIGIN = new URL(WEB_APP_URL).origin;
export const NATIVE_SCHEME = "nextwebview";

function normalizeWebAppUrl(value: string): string {
  const parsed = new URL(value);

  if (!(["http:", "https:"] as const).includes(parsed.protocol as "http:" | "https:")) {
    throw new Error("EXPO_PUBLIC_WEB_APP_URL must use http or https.");
  }

  if (!__DEV__ && parsed.protocol !== "https:") {
    throw new Error("Production WebView origin must use HTTPS.");
  }

  return parsed.toString().replace(/\/$/, "");
}
