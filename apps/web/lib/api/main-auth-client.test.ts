import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { createMainAuthProxy } from "./main-auth-client";

vi.mock("server-only", () => ({}));

describe("Main/Auth BFF", () => {
  it("forwards login and returns only the three approved Auth cookies", async () => {
    const upstreamHeaders = new Headers();
    upstreamHeaders.append(
      "set-cookie",
      "civic_ai_access_token=header.payload.signature; Path=/; Max-Age=900; Secure; HttpOnly; SameSite=Lax",
    );
    upstreamHeaders.append(
      "set-cookie",
      "civic_ai_refresh_token=opaque-refresh; Path=/api/v1/auth; Max-Age=2592000; Secure; HttpOnly; SameSite=Lax",
    );
    upstreamHeaders.append("set-cookie", "untrusted=value; Path=/");
    const requestBackend = vi.fn<typeof fetch>(async (_input, init) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("origin")).toBe("https://civic.example");
      expect(headers.get("sec-fetch-site")).toBe("same-origin");
      expect(headers.get("authorization")).toBeNull();
      return new Response(null, { status: 204, headers: upstreamHeaders });
    });
    const proxy = createMainAuthProxy({
      browserOrigin: "https://civic.example",
      mainAuthUrl: new URL("http://main-auth.internal:8080"),
      requestBackend,
    });
    const response = await proxy(
      new NextRequest("https://civic.example/api/v1/auth/login", {
        method: "POST",
        headers: {
          authorization: "Bearer must-not-forward",
          "content-type": "application/json",
          origin: "https://civic.example",
          "sec-fetch-site": "same-origin",
        },
        body: JSON.stringify({ email: "user@example.com", password: "password" }),
      }),
      "/api/v1/auth/login",
    );

    expect(response.status).toBe(204);
    const setCookies = response.headers.getSetCookie().join("\n");
    expect(setCookies).toContain("civic_ai_access_token=header.payload.signature");
    expect(setCookies).toContain("civic_ai_refresh_token=opaque-refresh");
    expect(setCookies).not.toContain("untrusted=value");
  });

  it("uses the access cookie to obtain CSRF before an authenticated mutation", async () => {
    const calls: Array<{ url: string; headers: Headers }> = [];
    const requestBackend = vi.fn<typeof fetch>(async (input, init) => {
      calls.push({ url: String(input), headers: new Headers(init?.headers) });
      return String(input).endsWith("/api/v1/auth/csrf")
        ? Response.json({ csrf_token: "csrf-1" })
        : Response.json({ email: "user@example.com" });
    });
    const proxy = createMainAuthProxy({
      browserOrigin: "https://civic.example",
      mainAuthUrl: new URL("http://main-auth.internal:8080"),
      requestBackend,
    });
    const response = await proxy(
      new NextRequest("https://civic.example/api/v1/account/profile", {
        method: "PATCH",
        headers: {
          cookie: "civic_ai_access_token=header.payload.signature; unrelated=must-not-forward",
          "content-type": "application/json",
          origin: "https://civic.example",
          "sec-fetch-site": "same-origin",
        },
        body: JSON.stringify({ display_name: "시민" }),
      }),
      "/api/v1/account/profile",
    );

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.headers.get("cookie")).toBe("civic_ai_access_token=header.payload.signature");
    expect(calls[1]?.headers.get("x-csrf-token")).toBe("csrf-1");
  });

  it("forwards the path-scoped refresh cookie only to the refresh endpoint", async () => {
    let cookies: string | null = null;
    const proxy = createMainAuthProxy({
      browserOrigin: "https://civic.example",
      mainAuthUrl: new URL("http://main-auth.internal:8080"),
      requestBackend: vi.fn<typeof fetch>(async (_input, init) => {
        cookies = new Headers(init?.headers).get("cookie");
        return new Response(null, { status: 204 });
      }),
    });
    const response = await proxy(
      new NextRequest("https://civic.example/api/v1/auth/refresh", {
        method: "POST",
        headers: {
          cookie: "civic_ai_refresh_token=opaque-refresh",
          origin: "https://civic.example",
          "sec-fetch-site": "same-origin",
          "content-type": "application/json",
        },
        body: "{}",
      }),
      "/api/v1/auth/refresh",
    );
    expect(response.status).toBe(204);
    expect(cookies).toBe("civic_ai_refresh_token=opaque-refresh");
  });

  it("blocks cross-origin mutations before contacting Main/Auth", async () => {
    const requestBackend = vi.fn<typeof fetch>();
    const proxy = createMainAuthProxy({
      browserOrigin: "https://civic.example",
      mainAuthUrl: new URL("http://main-auth.internal:8080"),
      requestBackend,
    });
    const response = await proxy(
      new NextRequest("https://civic.example/api/v1/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://attacker.example",
          "sec-fetch-site": "cross-site",
        },
        body: "{}",
      }),
      "/api/v1/auth/login",
    );
    expect(response.status).toBe(403);
    expect(requestBackend).not.toHaveBeenCalled();
  });
});
