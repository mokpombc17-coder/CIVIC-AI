import { jwtVerify } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHAT_AUDIT_EXPORT_SCOPE,
  CHAT_ROOM_MEMBERSHIP_LIMIT_EXEMPT_SCOPE,
  PLATFORM_AUTH_AUDIENCE,
  PLATFORM_AUTH_COOKIE_NAME,
  PLATFORM_AUTH_SCOPE,
  VOTE_AUTH_SCOPES,
} from "@/lib/server/auth/platform-auth-contract";

vi.mock("server-only", () => ({}));

describe("/api/dev/auth/session", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "development");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("issues a local E2E JWT in an HttpOnly cookie", async () => {
    const { POST } = await import("./route");
    const {
      LOCAL_E2E_AUTH_ALGORITHM,
      LOCAL_E2E_AUTH_FIXTURE_SIGNING_KEY,
      LOCAL_E2E_AUTH_ISSUER,
      LOCAL_E2E_AUTH_TOKEN_TTL_SECONDS,
    } = await import("@/lib/server/auth/local-e2e-jwt");
    const response = await POST(sessionRequest({ subject: "owner-1" }));
    const setCookie = requiredSetCookie(response);
    const token = requiredCookieValue(setCookie);
    const { payload, protectedHeader } = await jwtVerify(
      token,
      new TextEncoder().encode(LOCAL_E2E_AUTH_FIXTURE_SIGNING_KEY),
      {
        issuer: LOCAL_E2E_AUTH_ISSUER,
        audience: PLATFORM_AUTH_AUDIENCE,
        algorithms: [LOCAL_E2E_AUTH_ALGORITHM],
      },
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("SameSite=lax");
    expect(setCookie).toContain(`Max-Age=${LOCAL_E2E_AUTH_TOKEN_TTL_SECONDS}`);
    expect(setCookie).not.toContain("Secure");
    expect(protectedHeader).toEqual({
      alg: "HS256",
      typ: "JWT",
    });
    expect(payload).toMatchObject({
      iss: LOCAL_E2E_AUTH_ISSUER,
      aud: PLATFORM_AUTH_AUDIENCE,
      sub: "owner-1",
      scope: PLATFORM_AUTH_SCOPE,
    });
    const grantedScopes = String(payload.scope).split(" ");
    expect(grantedScopes).toEqual(expect.arrayContaining([...VOTE_AUTH_SCOPES]));
    expect(grantedScopes).not.toContain(CHAT_AUDIT_EXPORT_SCOPE);
    expect(grantedScopes.some((scope) => scope.startsWith("vote:admin:"))).toBe(false);
    expect(payload.jti).toEqual(expect.any(String));
  });

  it("issues the audit Export scope only through the allowlisted local Super Admin subject", async () => {
    const { POST } = await import("./route");
    const {
      LOCAL_E2E_CHAT_EXPORT_ADMIN_SUBJECT,
      LOCAL_E2E_AUTH_ALGORITHM,
      LOCAL_E2E_AUTH_FIXTURE_SIGNING_KEY,
      LOCAL_E2E_AUTH_ISSUER,
    } = await import("@/lib/server/auth/local-e2e-jwt");
    const response = await POST(sessionRequest({ subject: LOCAL_E2E_CHAT_EXPORT_ADMIN_SUBJECT }));
    const token = requiredCookieValue(requiredSetCookie(response));
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(LOCAL_E2E_AUTH_FIXTURE_SIGNING_KEY),
      {
        issuer: LOCAL_E2E_AUTH_ISSUER,
        audience: PLATFORM_AUTH_AUDIENCE,
        algorithms: [LOCAL_E2E_AUTH_ALGORITHM],
      },
    );

    expect(response.status).toBe(204);
    expect(payload).toMatchObject({
      sub: LOCAL_E2E_CHAT_EXPORT_ADMIN_SUBJECT,
      scope: `${PLATFORM_AUTH_SCOPE} ${CHAT_AUDIT_EXPORT_SCOPE}`,
    });
  });

  it("issues the quota exemption only through an allowlisted pagination subject", async () => {
    const { POST } = await import("./route");
    const { LOCAL_E2E_AUTH_ALGORITHM, LOCAL_E2E_AUTH_FIXTURE_SIGNING_KEY, LOCAL_E2E_AUTH_ISSUER } =
      await import("@/lib/server/auth/local-e2e-jwt");
    const subject = "e2e-latest-member-pagination-43d79df6-df54-4d02-8ecf-a1f410d53e16";
    const response = await POST(sessionRequest({ subject }));
    const token = requiredCookieValue(requiredSetCookie(response));
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(LOCAL_E2E_AUTH_FIXTURE_SIGNING_KEY),
      {
        issuer: LOCAL_E2E_AUTH_ISSUER,
        audience: PLATFORM_AUTH_AUDIENCE,
        algorithms: [LOCAL_E2E_AUTH_ALGORITHM],
      },
    );

    expect(response.status).toBe(204);
    expect(payload).toMatchObject({
      sub: subject,
      scope: `${PLATFORM_AUTH_SCOPE} ${CHAT_ROOM_MEMBERSHIP_LIMIT_EXEMPT_SCOPE}`,
    });
  });

  it("rejects malformed JSON and invalid subjects without setting a cookie", async () => {
    const { POST } = await import("./route");
    const malformedResponse = await POST(
      new Request("http://localhost:3000/api/dev/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
    );
    const blankSubjectResponse = await POST(sessionRequest({ subject: " " }));

    expect(malformedResponse.status).toBe(400);
    expect(malformedResponse.headers.get("set-cookie")).toBeNull();
    await expect(malformedResponse.json()).resolves.toMatchObject({
      error: "Invalid request.",
    });
    expect(blankSubjectResponse.status).toBe(400);
    expect(blankSubjectResponse.headers.get("set-cookie")).toBeNull();
  });

  it("clears the local authentication cookie", async () => {
    const { DELETE } = await import("./route");
    const response = DELETE();
    const setCookie = requiredSetCookie(response);

    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(setCookie).toContain(`${PLATFORM_AUTH_COOKIE_NAME}=`);
    expect(setCookie).toContain("Max-Age=0");
    expect(setCookie).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Path=/");
  });

  it("does not expose the emulator in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { DELETE, POST } = await import("./route");

    const createResponse = await POST(sessionRequest({ subject: "owner-1" }));
    const deleteResponse = DELETE();

    expect(createResponse.status).toBe(404);
    expect(createResponse.headers.get("set-cookie")).toBeNull();
    expect(deleteResponse.status).toBe(404);
    expect(deleteResponse.headers.get("set-cookie")).toBeNull();
  });
});

function sessionRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/dev/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function requiredSetCookie(response: Response): string {
  const setCookie = response.headers.get("set-cookie");
  expect(setCookie).not.toBeNull();
  return setCookie!;
}

function requiredCookieValue(setCookie: string): string {
  const match = new RegExp(`${PLATFORM_AUTH_COOKIE_NAME}=([^;]+)`).exec(setCookie);
  expect(match?.[1]).toBeTruthy();
  return match![1]!;
}
