import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";
import {
  createDevQuickLoginHandler,
  devQuickLoginAvailable,
  readDevQuickLoginConfig,
  type DevQuickLoginConfig,
} from "./dev-quick-login";

vi.mock("server-only", () => ({}));

const config: DevQuickLoginConfig = {
  host: "140-238-17-223.sslip.io",
  user: { email: "user@example.test", password: "user-secret" },
  admin: { email: "admin@example.test", password: "admin-secret" },
};
const credentialCases = [
  ["USER", { email: "user@example.test", password: "user-secret" }],
  ["ADMIN", { email: "admin@example.test", password: "admin-secret" }],
] as const;

describe("development quick login", () => {
  it("keeps the feature disabled until all credentials are present in server-only env", () => {
    expect(readDevQuickLoginConfig({ CIVIC_DEV_QUICK_LOGIN_HOST: config.host })).toBeNull();
    expect(
      readDevQuickLoginConfig({
        CIVIC_DEV_QUICK_LOGIN_HOST: config.host,
        CIVIC_DEV_QUICK_LOGIN_USER_EMAIL: config.user.email,
        CIVIC_DEV_QUICK_LOGIN_USER_PASSWORD: config.user.password,
        CIVIC_DEV_QUICK_LOGIN_ADMIN_EMAIL: config.admin.email,
        CIVIC_DEV_QUICK_LOGIN_ADMIN_PASSWORD: config.admin.password,
      }),
    ).toEqual(config);
  });

  it("enables the feature only for the exact configured host with complete server credentials", () => {
    expect(devQuickLoginAvailable("140-238-17-223.sslip.io", config)).toBe(true);
    expect(devQuickLoginAvailable("140-238-17-223.sslip.io:443", config)).toBe(true);
    expect(devQuickLoginAvailable("other.example", config)).toBe(false);
    expect(devQuickLoginAvailable("140-238-17-223.sslip.io.evil.example", config)).toBe(false);
    expect(devQuickLoginAvailable("140-238-17-223.sslip.io", null)).toBe(false);
  });

  it.each(credentialCases)(
    "forwards the %s account through the existing Auth login proxy",
    async (account, expected) => {
      let forwardedBody: unknown;
      let forwardedPath = "";
      const handler = createDevQuickLoginHandler({
        config,
        loginProxy: async (request, upstreamPath) => {
          forwardedBody = await request.json();
          forwardedPath = upstreamPath;
          return new NextResponse(null, { status: 204 });
        },
      });

      const response = await handler(devRequest({ account }));

      expect(response.status).toBe(204);
      expect(forwardedPath).toBe("/api/v1/auth/login");
      expect(forwardedBody).toEqual(expected);
    },
  );

  it("returns not found without forwarding credentials from another host", async () => {
    const handler = createDevQuickLoginHandler({
      config,
      loginProxy: async () => new NextResponse(null, { status: 204 }),
    });

    const response = await handler(devRequest({ account: "USER" }, { host: "other.example" }));

    expect(response.status).toBe(404);
  });

  it("rejects unknown account selectors without exposing credentials", async () => {
    const handler = createDevQuickLoginHandler({
      config,
      loginProxy: async () => new NextResponse(null, { status: 204 }),
    });

    const response = await handler(devRequest({ account: "HIGHEST_ADMIN" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ status: 400, code: "INVALID_ACCOUNT" });
  });
});

function devRequest(
  body: unknown,
  {
    host = "140-238-17-223.sslip.io",
    url = "http://web:3000/api/dev/auth/login",
  }: Readonly<{ host?: string; url?: string }> = {},
) {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host,
      origin: "https://140-238-17-223.sslip.io",
      "sec-fetch-site": "same-origin",
    },
    body: JSON.stringify(body),
  });
}
