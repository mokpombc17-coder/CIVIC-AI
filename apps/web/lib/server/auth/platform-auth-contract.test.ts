import { describe, expect, it } from "vitest";
import {
  CHAT_AUDIT_EXPORT_SCOPE,
  CHAT_RESEARCH_EXPORT_SCOPE,
  PLATFORM_AUTH_COOKIE_NAME,
  PLATFORM_AUTH_COOKIE_PATH,
  PLATFORM_AUTH_SCOPE,
  PLATFORM_AUTH_SCOPES,
  PLATFORM_PWA_REFRESH_COOKIE_NAME,
  PLATFORM_PWA_REFRESH_COOKIE_PATH,
  PLATFORM_REFRESH_COOKIE_NAME,
  PLATFORM_REFRESH_COOKIE_PATH,
  VOTE_PERSONA_GENERATION_RETRY_SCOPE,
  VOTE_SURVEY_OUTBOX_REPLAY_SCOPE,
} from "./platform-auth-contract";

describe("platform-auth-contract", () => {
  it("관리자·운영자 scope를 일반 사용자의 기본 scope와 분리한다", () => {
    const forbidden = [
      CHAT_AUDIT_EXPORT_SCOPE,
      CHAT_RESEARCH_EXPORT_SCOPE,
      VOTE_SURVEY_OUTBOX_REPLAY_SCOPE,
      VOTE_PERSONA_GENERATION_RETRY_SCOPE,
    ];
    expect(PLATFORM_AUTH_SCOPES).not.toEqual(expect.arrayContaining(forbidden));
    expect(PLATFORM_AUTH_SCOPE.split(" ")).not.toEqual(expect.arrayContaining(forbidden));
    expect(PLATFORM_AUTH_SCOPES).toEqual(
      expect.arrayContaining(["vote:personas:read", "vote:predictions:write", "rag:queries:write"]),
    );
  });

  it("Access Token과 Refresh Token의 브라우저 경계를 고정한다", () => {
    expect([PLATFORM_AUTH_COOKIE_NAME, PLATFORM_AUTH_COOKIE_PATH]).toEqual([
      "civic_ai_access_token",
      "/",
    ]);
    expect([PLATFORM_REFRESH_COOKIE_NAME, PLATFORM_REFRESH_COOKIE_PATH]).toEqual([
      "civic_ai_refresh_token",
      "/api/v1/auth",
    ]);
    expect([PLATFORM_PWA_REFRESH_COOKIE_NAME, PLATFORM_PWA_REFRESH_COOKIE_PATH]).toEqual([
      "civic_ai_pwa_refresh_token",
      "/api/v1/auth/pwa",
    ]);
  });
});
