import { jwtVerify } from "jose";
import { describe, expect, it, vi } from "vitest";
import { CHAT_AUTH_SCOPE, PLATFORM_AUTH_AUDIENCE } from "./platform-auth-contract";

vi.mock("server-only", () => ({}));

describe("issueLocalPlatformJwt", () => {
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
      scope: CHAT_AUTH_SCOPE,
      iat: issuedAt,
      exp: issuedAt + LOCAL_PLATFORM_AUTH_TOKEN_TTL_SECONDS,
      jti: jwtId,
    });
  });

  it("rejects an empty subject before signing", async () => {
    const { issueLocalPlatformJwt } = await import("./local-platform-jwt");

    await expect(issueLocalPlatformJwt({ subject: "   " })).rejects.toThrow(
      "A non-empty subject is required.",
    );
  });
});
