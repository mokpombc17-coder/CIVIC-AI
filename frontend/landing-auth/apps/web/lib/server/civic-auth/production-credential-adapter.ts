import "server-only";

import { timingSafeEqual } from "node:crypto";
import { PLATFORM_AUTH_COOKIE_NAME } from "@/lib/server/auth/platform-auth-contract";

export type CivicProductionCredential = Readonly<{
  token: string;
  source: "incoming";
}>;

export type ResolveCivicProductionCredentialOptions = Readonly<{
  browserRequest: Request;
  expectedOrigin: string;
  requestId: string;
}>;

export class CivicProductionCredentialError extends Error {
  constructor(
    readonly status: number,
    readonly code: "ACCESS_DENIED" | "AUTHENTICATION_REQUIRED" | "CREDENTIAL_MISMATCH",
  ) {
    super(code);
  }
}

/**
 * Preserves the opaque common Access Token boundary.
 *
 * Frontend never parses, validates, or refreshes the JWT on the server. Main/Auth
 * owns browser refresh at /api/v1/auth/refresh and each Resource Server owns JWT
 * verification. If Cookie and Authorization are both supplied, their raw values
 * must be identical.
 */
export async function resolveCivicProductionCredential({
  browserRequest,
  expectedOrigin,
}: ResolveCivicProductionCredentialOptions): Promise<CivicProductionCredential> {
  assertSameOrigin(browserRequest, expectedOrigin);

  const cookieToken = readSingleCookie(
    browserRequest.headers.get("cookie"),
    PLATFORM_AUTH_COOKIE_NAME,
  );
  const authorizationHeader = browserRequest.headers.get("authorization");
  const headerToken = readBearer(authorizationHeader);

  if (authorizationHeader && !headerToken) {
    throw new CivicProductionCredentialError(401, "CREDENTIAL_MISMATCH");
  }
  if (cookieToken && headerToken && !credentialsMatch(cookieToken, headerToken)) {
    throw new CivicProductionCredentialError(401, "CREDENTIAL_MISMATCH");
  }

  const token = cookieToken ?? headerToken;
  if (!token) {
    throw new CivicProductionCredentialError(401, "AUTHENTICATION_REQUIRED");
  }
  return { token, source: "incoming" };
}

/** Adds the same raw token to Cookie and Authorization for a Resource Server. */
export function applyCivicProductionCredential(
  headers: Headers,
  credential: CivicProductionCredential,
): Headers {
  headers.set("authorization", `Bearer ${credential.token}`);
  headers.set("cookie", `${PLATFORM_AUTH_COOKIE_NAME}=${credential.token}`);
  return headers;
}

function assertSameOrigin(request: Request, expectedOrigin: string): void {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(expectedOrigin).origin) {
    throw new CivicProductionCredentialError(403, "ACCESS_DENIED");
  }
}

function readSingleCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  let match: string | undefined;
  let count = 0;
  for (const item of header.split(";")) {
    const [candidate, ...parts] = item.trim().split("=");
    if (candidate !== name) continue;
    count += 1;
    if (count > 1) {
      throw new CivicProductionCredentialError(401, "CREDENTIAL_MISMATCH");
    }
    const value = parts.join("=");
    if (!value) throw new CivicProductionCredentialError(401, "CREDENTIAL_MISMATCH");
    match = value;
  }
  return match;
}

function readBearer(header: string | null): string | undefined {
  if (!header) return undefined;
  return /^Bearer ([^\s]+)$/u.exec(header)?.[1];
}

function credentialsMatch(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}
