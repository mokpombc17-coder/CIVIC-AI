import * as WebBrowser from "expo-web-browser";
import { IS_DEVELOPMENT, NATIVE_SCHEME, WEB_APP_ORIGIN } from "../config/runtime";

export type NativeAuthResult = { type: "success"; callbackUrl: string } | { type: "cancelled" };

export async function startNativeAuth(
  authorizationUrl: string,
  callbackUrl: string,
): Promise<NativeAuthResult> {
  assertTrustedAuthorizationUrl(authorizationUrl);
  assertTrustedCallbackUrl(callbackUrl);

  const result = await WebBrowser.openAuthSessionAsync(authorizationUrl, callbackUrl);
  if (result.type !== "success") {
    return { type: "cancelled" };
  }

  assertMatchingCallback(result.url, callbackUrl);
  return { type: "success", callbackUrl: result.url };
}

function assertTrustedAuthorizationUrl(rawUrl: string): void {
  const url = new URL(rawUrl);
  if (url.origin !== WEB_APP_ORIGIN) {
    throw new Error("OAuth must start from the configured Next.js BFF origin.");
  }

  if (!IS_DEVELOPMENT && url.protocol !== "https:") {
    throw new Error("OAuth requires HTTPS in production.");
  }
}

function assertTrustedCallbackUrl(rawUrl: string): void {
  const url = new URL(rawUrl);
  const isNativeCallback = url.protocol === `${NATIVE_SCHEME}:`;
  const isUniversalLinkCallback = url.protocol === "https:" && url.origin === WEB_APP_ORIGIN;

  if (!isNativeCallback && !isUniversalLinkCallback) {
    throw new Error("OAuth callback must use the app scheme or configured web origin.");
  }
}

function assertMatchingCallback(resultUrl: string, expectedUrl: string): void {
  const result = new URL(resultUrl);
  const expected = new URL(expectedUrl);
  const sameTarget =
    result.protocol === expected.protocol &&
    result.hostname === expected.hostname &&
    result.port === expected.port &&
    result.pathname === expected.pathname;

  if (!sameTarget) {
    throw new Error("OAuth returned to an unexpected callback URL.");
  }
}
