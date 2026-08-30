import {
  PLATFORM_AUTH_COOKIE_NAME,
  PLATFORM_AUTH_COOKIE_PATH,
  PLATFORM_AUTH_FLOW_COOKIE_NAME,
  PLATFORM_REFRESH_COOKIE_NAME,
  PLATFORM_REFRESH_COOKIE_PATH,
} from "@/lib/server/auth/platform-auth-contract";

const cookiePolicies = new Map<string, Readonly<{ path: string; sameSite: "Lax" | "Strict" }>>([
  [PLATFORM_AUTH_FLOW_COOKIE_NAME, { path: "/", sameSite: "Strict" }],
  [PLATFORM_AUTH_COOKIE_NAME, { path: PLATFORM_AUTH_COOKIE_PATH, sameSite: "Lax" }],
  [PLATFORM_REFRESH_COOKIE_NAME, { path: PLATFORM_REFRESH_COOKIE_PATH, sameSite: "Lax" }],
]);

export function readSafeMainAuthSetCookies(headers: Headers): string[] {
  return readSetCookieHeaders(headers).filter(isSafeMainAuthCookie);
}

export function isSafeMainAuthCookie(value: string): boolean {
  const separator = value.indexOf("=");
  if (separator < 1) return false;
  const policy = cookiePolicies.get(value.slice(0, separator));
  if (!policy) return false;
  return (
    /;\s*Secure(?:;|$)/iu.test(value) &&
    /;\s*HttpOnly(?:;|$)/iu.test(value) &&
    new RegExp(`;\\s*Path=${escapeRegExp(policy.path)}(?:;|$)`, "iu").test(value) &&
    new RegExp(`;\\s*SameSite=${policy.sameSite}(?:;|$)`, "iu").test(value) &&
    !/;\s*Domain=/iu.test(value)
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function readSetCookieHeaders(headers: Headers): string[] {
  const extended = headers as Headers & { getSetCookie?: () => string[] };
  const direct = extended.getSetCookie?.();
  if (direct && direct.length > 0) return direct;
  const combined = headers.get("set-cookie");
  return combined ? combined.split(/,(?=\s*[^;,=\s]+=[^;,]*)/u).map((value) => value.trim()) : [];
}
