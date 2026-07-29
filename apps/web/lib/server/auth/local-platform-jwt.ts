import "server-only";

import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { CHAT_AUTH_SCOPE, PLATFORM_AUTH_AUDIENCE } from "./platform-auth-contract";

export const LOCAL_PLATFORM_AUTH_ALGORITHM = "HS256";
export const LOCAL_PLATFORM_AUTH_ISSUER = "http://localhost:3000/api/dev/auth";
export const LOCAL_PLATFORM_AUTH_TOKEN_TTL_SECONDS = 60 * 60;

/**
 * Public, deterministic development fixture. This is intentionally committed
 * so local Resource Servers can validate tokens from the Next.js auth emulator.
 * It is not a secret and must never be accepted outside a local profile.
 */
export const LOCAL_PLATFORM_AUTH_FIXTURE_SIGNING_KEY =
  "civic-ai-local-auth-fixture-signing-key-v1-public-do-not-use-in-production";

const fixtureSigningKey = new TextEncoder().encode(LOCAL_PLATFORM_AUTH_FIXTURE_SIGNING_KEY);

type IssueLocalPlatformJwtInput = {
  subject: string;
  now?: Date;
  jwtId?: string;
};

export async function issueLocalPlatformJwt({
  subject,
  now = new Date(),
  jwtId = randomUUID(),
}: IssueLocalPlatformJwtInput): Promise<string> {
  const normalizedSubject = subject.trim();
  if (!normalizedSubject) {
    throw new TypeError("A non-empty subject is required.");
  }

  const issuedAt = Math.floor(now.getTime() / 1000);

  return new SignJWT({
    scope: CHAT_AUTH_SCOPE,
  })
    .setProtectedHeader({
      alg: LOCAL_PLATFORM_AUTH_ALGORITHM,
      typ: "JWT",
    })
    .setIssuer(LOCAL_PLATFORM_AUTH_ISSUER)
    .setAudience(PLATFORM_AUTH_AUDIENCE)
    .setSubject(normalizedSubject)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + LOCAL_PLATFORM_AUTH_TOKEN_TTL_SECONDS)
    .setJti(jwtId)
    .sign(fixtureSigningKey);
}
