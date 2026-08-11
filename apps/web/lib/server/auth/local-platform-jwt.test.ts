import { decodeJwt, jwtVerify } from "jose";
import { describe, expect, it, vi } from "vitest";
import {
  CHAT_ROOM_MEMBERSHIP_LIMIT_EXEMPT_SCOPE,
  PLATFORM_AUTH_AUDIENCE,
  PLATFORM_AUTH_SCOPE,
  VOTE_AUTH_SCOPES,
} from "./platform-auth-contract";

vi.mock("server-only", () => ({}));

describe("issueLocalPlatformJwt", () => {
  const paginationFixtureId = "43d79df6-df54-4d02-8ecf-a1f410d53e16";

  it("issues the documented local platform access-token contract", async () => {
    const {
      issueLocalPlatformJwt,
      LOCAL_PLATFORM_AUTH_ALGORITHM,
      LOCAL_PLATFORM_AUTH_FIXTURE_SIGNING_KEY,
      LOCAL_PLATFORM_AUTH_ISSUER,
      LOCAL_PLATFORM_AUTH_TOKEN_TTL_SECONDS,
    } = await import("./local-platform-jwt");
    const now = new Date("2026-07-29T00:00:00.000Z");
    const jwtId = "43d79df6-df54-4d02-8ecf-a1f410d53e16";

    const token = await issueLocalPlatformJwt({
      subject: " owner-1 ",
      now,
      jwtId,
    });
    const { payload, protectedHeader } = await jwtVerify(
      token,
      new TextEncoder().encode(LOCAL_PLATFORM_AUTH_FIXTURE_SIGNING_KEY),
      {
        issuer: LOCAL_PLATFORM_AUTH_ISSUER,
        audience: PLATFORM_AUTH_AUDIENCE,
        algorithms: [LOCAL_PLATFORM_AUTH_ALGORITHM],
        currentDate: now,
      },
    );
    const issuedAt = Math.floor(now.getTime() / 1000);

    expect(protectedHeader).toEqual({
      alg: "HS256",
      typ: "JWT",
    });
    expect(payload).toMatchObject({
      iss: LOCAL_PLATFORM_AUTH_ISSUER,
      aud: PLATFORM_AUTH_AUDIENCE,
      sub: "owner-1",
      scope: PLATFORM_AUTH_SCOPE,
      iat: issuedAt,
      exp: issuedAt + LOCAL_PLATFORM_AUTH_TOKEN_TTL_SECONDS,
      jti: jwtId,
    });
    const grantedScopes = String(payload.scope).split(" ");
    expect(grantedScopes).toContain("chat:read-state:write");
    expect(grantedScopes).toEqual(expect.arrayContaining([...VOTE_AUTH_SCOPES]));
    expect(grantedScopes.some((scope) => scope.startsWith("vote:admin:"))).toBe(false);
  });

  it.each(["owner", "member"])(
    "adds the Room membership quota exemption for the pagination %s fixture",
    async (actor) => {
      const { issueLocalPlatformJwt } = await import("./local-platform-jwt");
      const token = await issueLocalPlatformJwt({
        subject: `e2e-latest-${actor}-pagination-${paginationFixtureId}`,
      });

      expect(decodeJwt(token).scope).toBe(
        `${PLATFORM_AUTH_SCOPE} ${CHAT_ROOM_MEMBERSHIP_LIMIT_EXEMPT_SCOPE}`,
      );
    },
  );

  it.each([
    `e2e-latest-owner-ordering-${paginationFixtureId}`,
    "e2e-latest-owner-pagination-not-a-uuid",
    `e2e-latest-sender-pagination-${paginationFixtureId}`,
    "e2e-inbox-pagination-observer",
  ])("does not exempt a non-allowlisted subject: %s", async (subject) => {
    const { issueLocalPlatformJwt } = await import("./local-platform-jwt");
    const token = await issueLocalPlatformJwt({ subject });

    expect(decodeJwt(token).scope).toBe(PLATFORM_AUTH_SCOPE);
  });

  it("rejects an empty subject before signing", async () => {
    const { issueLocalPlatformJwt } = await import("./local-platform-jwt");

    await expect(issueLocalPlatformJwt({ subject: "   " })).rejects.toThrow(
      "A non-empty subject is required.",
    );
  });
});
