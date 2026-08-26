import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  PlatformBottomNavigation,
  PlatformBottomNavigationItem,
  PlatformHeader,
  PlatformShell,
} from "./index";

describe("PlatformShell", () => {
  it("기본적으로 공통 콘텐츠 영역이 스크롤을 소유한다", () => {
    const markup = renderShell();

    expect(markup).toContain('data-platform-shell="true"');
    expect(markup).toContain('data-platform-shell-content="true"');
    expect(markup.match(/data-scroll="self"/g)).toHaveLength(2);
    expect(markup.indexOf("공통 헤더")).toBeLessThan(markup.indexOf("도메인 콘텐츠"));
    expect(markup.indexOf("도메인 콘텐츠")).toBeLessThan(markup.indexOf("주요 메뉴"));
  });

  it("child 모드에서는 자식 도메인에 스크롤 책임을 위임한다고 표시한다", () => {
    const markup = renderShell("child");

    expect(markup.match(/data-scroll="child"/g)).toHaveLength(2);
  });
});

describe("PlatformHeader", () => {
  it("leading, title, actions를 배치하되 동작은 소유하지 않는다", () => {
    const markup = renderToStaticMarkup(
      <PlatformHeader
        actions={<button type="button">추가 작업</button>}
        leading={<a href="/account">계정으로</a>}
        title="내 정보 관리"
      />,
    );

    expect(markup).toContain('href="/account"');
    expect(markup).toContain("내 정보 관리");
    expect(markup).toContain("추가 작업");
  });
});

describe("PlatformBottomNavigation", () => {
  it("anchor와 aria-current를 호출자가 결정하도록 유지한다", () => {
    const markup = renderToStaticMarkup(
      <PlatformBottomNavigation>
        <PlatformBottomNavigationItem href="/" icon={<span>홈 아이콘</span>} label="홈" />
        <PlatformBottomNavigationItem
          aria-current="page"
          href="/account"
          icon={<span>계정 아이콘</span>}
          label="계정"
        />
      </PlatformBottomNavigation>,
    );

    expect(markup).toContain('aria-label="참여자 주요 메뉴"');
    expect(markup).toContain('href="/"');
    expect(markup).toContain('href="/account"');
    expect(markup).toContain('aria-current="page"');
  });
});

function renderShell(scroll?: "self" | "child"): string {
  return renderToStaticMarkup(
    <PlatformShell
      bottomNavigation={<nav>주요 메뉴</nav>}
      header={<header>공통 헤더</header>}
      {...(scroll ? { scroll } : {})}
    >
      <div>도메인 콘텐츠</div>
    </PlatformShell>,
  );
}
