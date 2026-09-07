import type { Route } from "next";
import Link from "next/link";
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
    expect(markup).toContain('data-platform-shell-content="true"');
    expect(markup.match(/data-scroll="self"/g)).toHaveLength(2);
    expect(markup.indexOf("공통 헤더")).toBeLessThan(markup.indexOf("도메인 콘텐츠"));
    expect(markup.indexOf("도메인 콘텐츠")).toBeLessThan(markup.indexOf("주요 메뉴"));
  });

  it("child 모드에서는 자식 도메인에 스크롤 책임을 위임한다고 표시한다", () => {
    const markup = renderShell("child");

    expect(markup.match(/data-scroll="child"/g)).toHaveLength(2);
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
        leading={<Link href={"/account" as Route}>계정으로</Link>}
        title="내 정보 관리"
      />,
    );

    expect(markup).toContain('href="/account"');
    expect(markup).toContain("내 정보 관리");
    expect(markup).toContain("추가 작업");
  });

  it("back action이 없으면 뒤로 가기 컨트롤을 렌더링하지 않는다", () => {
    const markup = renderToStaticMarkup(<PlatformHeader title="목록" />);

    expect(markup).not.toContain('aria-label="뒤로 가기"');
    expect(markup).not.toContain('data-state="disabled"');
  });

  it("back href가 있으면 활성 anchor로 표현한다", () => {
    const markup = renderToStaticMarkup(
      <PlatformHeader
        backAction={{ ariaLabel: "목록으로 돌아가기", href: "/home" }}
        title="상세 화면"
      />,
    );

    expect(markup).toContain('aria-label="목록으로 돌아가기"');
    expect(markup).toContain('data-state="enabled"');
    expect(markup).toContain('href="/home"');
    expect(markup).not.toContain("disabled");
  });

  it("비활성 back action은 회색 스타일을 적용할 수 있는 disabled 버튼으로 표현한다", () => {
    const markup = renderToStaticMarkup(
      <PlatformHeader
        backAction={{ ariaLabel: "이전 화면으로 돌아가기", disabled: true }}
        title="목록"
      />,
    );

    expect(markup).toContain('aria-label="이전 화면으로 돌아가기"');
    expect(markup).toContain('data-state="disabled"');
    expect(markup).toContain("disabled");
    expect(markup).not.toContain("href=");
  });
});

describe("PlatformBottomNavigation", () => {
  it("Next Link 목적지와 aria-current를 호출자가 결정하도록 유지한다", () => {
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

describe("PlatformNavigation", () => {
  it("Figma 순서와 route를 유지하고 현재 도메인만 active로 표시한다", () => {
    const markup = renderToStaticMarkup(<PlatformNavigation currentPathname="/vote/results" />);

    const expectedItems = [
      ['href="/home"', "홈"],
      ['href="/rag"', "AI"],
      ['href="/chat"', "토론방"],
      ['href="/vote"', "투표"],
      ['href="/mypage"', "계정"],
    ] as const;

    expectedItems.forEach(([href, label], index) => {
      expect(markup).toContain(href);
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

  it("이관 전 계정 경로도 frontend2 표준 메뉴에 매핑한다", () => {
    const account = renderToStaticMarkup(
      <PlatformNavigation currentPathname="/account/security" />,
    );

    expect(account).toMatch(/aria-current="page"[^>]*href="\/mypage"/);
  });

  it("비로그인 보호 메뉴의 로그인 return target query를 경로와 분리해 유지한다", () => {
    const markup = renderToStaticMarkup(
      <PlatformNavigation currentPathname="/home" requiresLoginForProtectedLinks />,
    );

    for (const route of ["rag", "chat", "vote", "mypage"]) {
      expect(markup).toContain(`href="/login?returnTo=%2F${route}"`);
    }
    expect(markup).not.toContain("/login%3FreturnTo=");
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
