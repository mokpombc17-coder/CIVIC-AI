import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHAT_AUTHENTICATION_REQUIRED_MESSAGE,
  clearChatAuthenticationRequired,
  createCurrentChatLoginHref,
  createChatLoginHref,
  getChatAuthenticationRequiredSnapshot,
  isChatAuthenticationRequired,
  isChatAuthenticationRequiredResponse,
  reportChatAuthenticationRequired,
  subscribeChatAuthenticationRequired,
} from "./chat-authentication-required";

describe("chat authentication required", () => {
  beforeEach(() => clearChatAuthenticationRequired());

  it("status-only 401과 UNAUTHENTICATED code를 인증 오류로 분류한다", () => {
    expect(isChatAuthenticationRequired({ status: 401 })).toBe(true);
    expect(isChatAuthenticationRequired({ code: "UNAUTHENTICATED", status: 400 })).toBe(true);
    expect(isChatAuthenticationRequired({ code: "ACCESS_DENIED", status: 403 })).toBe(false);
    expect(isChatAuthenticationRequiredResponse(401, undefined)).toBe(true);
    expect(isChatAuthenticationRequiredResponse(400, { code: "UNAUTHENTICATED" })).toBe(true);
  });

  it("현재 채팅 URL을 returnTo로 보존한 로그인 URL을 만든다", () => {
    expect(
      createChatLoginHref({
        pathname: "/chat/room-01",
        search: "?thread=latest",
        hash: "#message-10",
      }),
    ).toBe("/login?returnTo=%2Fchat%2Froom-01%3Fthread%3Dlatest%23message-10");
    expect(createCurrentChatLoginHref()).toBe("/login?returnTo=%2Fchat");
  });

  it("첫 인증 오류만 구독자에게 알리고 명시적으로 초기화한다", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeChatAuthenticationRequired(listener);

    expect(reportChatAuthenticationRequired({ status: 401 })).toBe(true);
    expect(reportChatAuthenticationRequired({ status: 401 })).toBe(true);
    expect(getChatAuthenticationRequiredSnapshot()).toBe(true);
    expect(listener).toHaveBeenCalledOnce();

    clearChatAuthenticationRequired();
    expect(getChatAuthenticationRequiredSnapshot()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
  });

  it("사용자 안내 문구에 서버 인증 상세를 포함하지 않는다", () => {
    expect(CHAT_AUTHENTICATION_REQUIRED_MESSAGE).toBe(
      "로그인 정보가 만료되었거나 유효하지 않습니다. 다시 로그인해 주세요.",
    );
    expect(CHAT_AUTHENTICATION_REQUIRED_MESSAGE).not.toContain("Bearer");
  });
});
