import type { NextRequest } from "next/server";

const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isTrustedBrowserRequest(request: NextRequest, configuredOrigin: string): boolean {
  if (!unsafeMethods.has(request.method.toUpperCase())) return true;

  let expectedOrigin: string;
  try {
    expectedOrigin = new URL(configuredOrigin).origin;
  } catch {
    return false;
  }
  return (
    request.headers.get("origin") === expectedOrigin &&
    request.headers.get("sec-fetch-site") === "same-origin"
  );
}
