import "server-only";

import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import {
  CHAT_AUDIT_EXPORT_SCOPE,
  CHAT_ROOM_MEMBERSHIP_LIMIT_EXEMPT_SCOPE,
  PLATFORM_AUTH_AUDIENCE,
  PLATFORM_AUTH_SCOPES,
} from "./platform-auth-contract";

export const LOCAL_E2E_AUTH_ALGORITHM = "HS256";
export const LOCAL_E2E_AUTH_ISSUER = "http://localhost:3000/api/dev/auth";
export const LOCAL_E2E_AUTH_TOKEN_TTL_SECONDS = 60 * 60;

/**
 * Public, deterministic Local E2E fixture for developer laptops. This is
 * intentionally committed so locally running Resource Servers can validate
 * tokens from the Next.js fixture issuer. It is not a secret and must never be
 * accepted outside local development processes.
 */
export const LOCAL_E2E_AUTH_FIXTURE_SIGNING_KEY =
  "civic-ai-local-auth-fixture-signing-key-v1-public-do-not-use-in-production";

const localE2EFixtureSigningKey = new TextEncoder().encode(LOCAL_E2E_AUTH_FIXTURE_SIGNING_KEY);

const localE2ERoomInboxPaginationSubjectPattern =
  /^e2e-latest-(?:owner|member)-pagination-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const LOCAL_E2E_CHAT_EXPORT_ADMIN_SUBJECT = "local-super-admin";

const localE2EChatExportAdminSubjectPattern =
  /^e2e-chat-export-admin-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type IssueLocalE2EJwtInput = {
  subject: string;
  now?: Date;
  jwtId?: string;
};

export async function issueLocalE2EJwt({
  subject,
  now = new Date(),
  jwtId = randomUUID(),
}: IssueLocalE2EJwtInput): Promise<string> {
  const normalizedSubject = subject.trim();
  if (!normalizedSubject) {
    throw new TypeError("A non-empty subject is required.");
  }

  const issuedAt = Math.floor(now.getTime() / 1000);

  return new SignJWT({
    scope: resolveLocalE2EScope(normalizedSubject),
  })
    .setProtectedHeader({
      alg: LOCAL_E2E_AUTH_ALGORITHM,
      typ: "JWT",
    })
    .setIssuer(LOCAL_E2E_AUTH_ISSUER)
    .setAudience(PLATFORM_AUTH_AUDIENCE)
    .setSubject(normalizedSubject)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + LOCAL_E2E_AUTH_TOKEN_TTL_SECONDS)
    .setJti(jwtId)
    .sign(localE2EFixtureSigningKey);
}

function resolveLocalE2EScope(subject: string): string {
  const scopes: string[] = [...PLATFORM_AUTH_SCOPES];

  if (localE2ERoomInboxPaginationSubjectPattern.test(subject)) {
    scopes.push(CHAT_ROOM_MEMBERSHIP_LIMIT_EXEMPT_SCOPE);
  }

  if (
    subject === LOCAL_E2E_CHAT_EXPORT_ADMIN_SUBJECT ||
    localE2EChatExportAdminSubjectPattern.test(subject)
  ) {
    scopes.push(CHAT_AUDIT_EXPORT_SCOPE);
  }

  return scopes.join(" ");
}
