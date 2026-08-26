import { describe, expect, it } from "vitest";
import { readSafeMainAuthSetCookies } from "./response-cookie-boundary";

describe("Main/Auth Set-Cookie forwarding", () => {
  it("preserves both terminal deletion cookies as separate safe values", () => {
    const headers = new Headers();
    headers.append(
      "set-cookie",
      "__Host-civic-auth-flow=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Strict",
    );
    headers.append(
      "set-cookie",
      "civic_ai_access_token=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax",
    );
    headers.append(
      "set-cookie",
      "civic_ai_refresh_token=; Max-Age=0; Path=/api/v1/auth; Secure; HttpOnly; SameSite=Lax",
    );

    expect(readSafeMainAuthSetCookies(headers)).toEqual([
      "__Host-civic-auth-flow=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Strict",
      "civic_ai_access_token=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax",
      "civic_ai_refresh_token=; Max-Age=0; Path=/api/v1/auth; Secure; HttpOnly; SameSite=Lax",
    ]);
  });

  it("drops public, scoped, or script-readable cookies", () => {
    const headers = new Headers({
      "set-cookie": "civic_ai_access_token=value; Domain=example.test; Path=/",
    });
    expect(readSafeMainAuthSetCookies(headers)).toEqual([]);
  });

  it("accepts the host-only HttpOnly platform access-token cookie", () => {
    const headers = new Headers({
      "set-cookie":
        "civic_ai_access_token=signed.jwt.value; Max-Age=900; Expires=Tue, 25 Aug 2026 12:15:00 GMT; Path=/; Secure; HttpOnly; SameSite=Lax",
    });

    expect(readSafeMainAuthSetCookies(headers)).toEqual([
      "civic_ai_access_token=signed.jwt.value; Max-Age=900; Expires=Tue, 25 Aug 2026 12:15:00 GMT; Path=/; Secure; HttpOnly; SameSite=Lax",
    ]);
  });

  it("rejects a refresh cookie outside its Auth-only path", () => {
    const headers = new Headers({
      "set-cookie": "civic_ai_refresh_token=opaque; Path=/; Secure; HttpOnly; SameSite=Lax",
    });
    expect(readSafeMainAuthSetCookies(headers)).toEqual([]);
  });
});
