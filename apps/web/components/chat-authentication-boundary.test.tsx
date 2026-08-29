import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChatAuthenticationBoundaryView } from "./chat-authentication-boundary";

vi.mock("next/navigation", () => ({
  usePathname: () => "/chat",
}));

describe("ChatAuthenticationBoundaryView", () => {
  it("인증이 필요하면 하위 화면 대신 로그인 안내 하나만 제공한다", () => {
    const markup = renderToStaticMarkup(
      <ChatAuthenticationBoundaryView
        authenticationRequired
        loginHref="/login?returnTo=%2Fchat%2Froom-01%3Ftab%3Dmembers"
      >
        <div data-chat-child="true">참여 중인 방을 불러오지 못했습니다.</div>
      </ChatAuthenticationBoundaryView>,
    );

    expect(markup).toContain('data-chat-authentication-required="true"');
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("chat-publishing-surface");
    expect(markup).toContain("border-[#ffc95c]");
    expect(markup).toContain("bg-[#fff7e8]");
    expect(markup).toContain("min-h-[204px]");
    expect(markup).toContain("h-12 min-w-[131px]");
    expect(markup).toContain("bg-[var(--chat-publishing-color-primary)]");
    expect(markup).toContain("text-white");
    expect(markup).toContain('href="/home"');
    expect(markup).toContain('href="/chat"');
    expect(markup).toContain('aria-current="page"');
    expect(markup.match(/로그인이 필요합니다\./g)).toHaveLength(1);
    expect(markup).toContain("로그인하면 현재 화면으로 돌아옵니다.");
    expect(markup).toContain("로그인하기");
    expect(markup).toContain('href="/login?returnTo=%2Fchat%2Froom-01%3Ftab%3Dmembers"');
    expect(markup).not.toContain('data-chat-child="true"');
    expect(markup).not.toContain("참여 중인 방을 불러오지 못했습니다.");
    expect(markup).not.toContain("Bearer");
  });

  it("인증이 유효하면 기존 하위 화면을 그대로 제공한다", () => {
    const markup = renderToStaticMarkup(
      <ChatAuthenticationBoundaryView authenticationRequired={false} loginHref="/login">
        <div data-chat-child="true">채팅 화면</div>
      </ChatAuthenticationBoundaryView>,
    );

    expect(markup).toContain('data-chat-child="true"');
    expect(markup).not.toContain('data-chat-authentication-required="true"');
    expect(markup).not.toContain("로그인하기");
  });
});
