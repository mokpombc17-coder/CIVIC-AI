import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  PlatformBottomNavigation,
  PlatformBottomNavigationItem,
  PlatformHeader,
  PlatformNavigation,
  PlatformShell,
} from "./index";

describe("PlatformShell", () => {
  it("기본적으로 공통 콘텐츠 영역이 스크롤을 소유한다", () => {
    const markup = renderShell();

    expect(markup).toContain('data-platform-shell="true"');
    expect(markup).toContain('data-keyboard-open="false"');
    expect(markup).toContain('data-platform-shell-content="true"');
    expect(markup).toContain('data-platform-shell-bottom-navigation="true"');
    expect(markup.match(/data-scroll="self"/g)).toHaveLength(2);
    expect(markup.indexOf("공통 헤더")).toBeLessThan(markup.indexOf("도메인 콘텐츠"));
    expect(markup.indexOf("도메인 콘텐츠")).toBeLessThan(markup.indexOf("주요 메뉴"));
  });

  it("child 모드에서는 자식 도메인에 스크롤 책임을 위임한다고 표시한다", () => {
    const markup = renderShell("child");

    expect(markup.match(/data-scroll="child"/g)).toHaveLength(2);
  });

  it("compact header 크기를 요청한 route를 표시한다", () => {
    const markup = renderToStaticMarkup(
      <PlatformShell header={<header>공통 헤더</header>} headerSize="compact">
        도메인 콘텐츠
      </PlatformShell>,
    );

    expect(markup).toContain('data-header-size="compact"');
  });

  it("overlay가 있으면 공통 surface를 inert 처리하고 overlay layer를 분리한다", () => {
    const markup = renderToStaticMarkup(
      <PlatformShell
        contentInert
        header={<header>공통 헤더</header>}
        overlay={<div role="dialog">도메인 대화상자</div>}
      >
        <button type="button">도메인 동작</button>
      </PlatformShell>,
    );

    expect(markup).toContain('data-platform-shell-surface="true"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('inert=""');
    expect(markup).toContain('data-platform-shell-overlay="true"');
    expect(markup.indexOf("도메인 동작")).toBeLessThan(markup.indexOf("도메인 대화상자"));
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

  it("back action이 없으면 Figma icon을 비활성 상태로 유지한다", () => {
    const markup = renderToStaticMarkup(<PlatformHeader title="토론방" />);

    expect(markup).toContain('aria-label="뒤로 가기"');
    expect(markup).toContain('data-state="disabled"');
    expect(markup).toContain("disabled");
  });

  it("내부 back href는 활성 client Link로 표현한다", () => {
    const markup = renderToStaticMarkup(
      <PlatformHeader
        backAction={{ ariaLabel: "목록으로 돌아가기", href: "/chat" }}
        title="프로젝트 회의방"
      />,
    );

    expect(markup).toContain('aria-label="목록으로 돌아가기"');
    expect(markup).toContain('data-navigation-mode="client"');
    expect(markup).toContain('data-state="enabled"');
    expect(markup).toContain('href="/chat"');
    expect(markup).not.toContain("disabled");
  });

  it("홈 back href는 문서 이동 anchor로 표현한다", () => {
    const markup = renderToStaticMarkup(
      <PlatformHeader backAction={{ ariaLabel: "홈으로", href: "/home" }} title="토론방" />,
    );

    expect(markup).toContain('aria-label="홈으로"');
    expect(markup).toContain('data-navigation-mode="document"');
    expect(markup).toContain('href="/home"');
  });
});

describe("PlatformBottomNavigation", () => {
  it("문서 이동과 client 이동 및 aria-current를 호출자가 결정하도록 유지한다", () => {
    const markup = renderToStaticMarkup(
      <PlatformBottomNavigation>
        <PlatformBottomNavigationItem
          href="/"
          icon={<span>홈 아이콘</span>}
          label="홈"
          navigationMode="document"
        />
        <PlatformBottomNavigationItem
          aria-current="page"
          href="/account"
          icon={<span>계정 아이콘</span>}
          label="계정"
          navigationMode="client"
        />
      </PlatformBottomNavigation>,
    );

    expect(markup).toContain('aria-label="참여자 주요 메뉴"');
    expect(markup).toContain('href="/"');
    expect(markup).toContain('href="/account"');
    expect(markup).toContain('aria-current="page"');
    expect(markup.match(/data-navigation-mode="document"/g)).toHaveLength(1);
    expect(markup.match(/data-navigation-mode="client"/g)).toHaveLength(1);
  });
});

describe("PlatformNavigation", () => {
  it("Figma 순서와 route를 유지하고 현재 도메인만 active로 표시한다", () => {
    const markup = renderToStaticMarkup(<PlatformNavigation currentPathname="/vote/results" />);

    const expectedItems = [
      ["/home", "홈", "document"],
      ["/rag", "AI", "document"],
      ["/chat", "토론방", "client"],
      ["/vote", "투표", "client"],
      ["/mypage", "계정", "document"],
    ] as const;

    expectedItems.forEach(([href, label, navigationMode], index) => {
      const anchor = markup.match(new RegExp(`<a[^>]*href="${href}"[^>]*>`))?.[0];

      expect(anchor).toContain(`data-navigation-mode="${navigationMode}"`);
      expect(anchor).toContain(`data-platform-navigation-route="${href}"`);
      expect(markup).toContain(`>${label}</span>`);

      const previousItem = expectedItems[index - 1];

      if (previousItem) {
        expect(markup.indexOf(previousItem[1])).toBeLessThan(markup.indexOf(label));
      }
    });

    expect(markup.match(/aria-current="page"/g)).toHaveLength(1);
    expect(markup).toMatch(/aria-current="page"[^>]*href="\/vote"/);
    expect(markup).toContain("/assets/platform-navigation/account.png");
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
