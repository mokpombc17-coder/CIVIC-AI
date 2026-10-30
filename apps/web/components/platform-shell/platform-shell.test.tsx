// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PlatformBottomNavigation,
  PlatformBottomNavigationItem,
  PlatformHeader,
  PlatformNavigation,
  PlatformScrollTopButton,
  PlatformShell,
} from "./index";

describe("PlatformShell", () => {
  afterEach(() => {
    cleanup();
  });

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

  it("scrollResetKey가 바뀌면 content 스크롤을 맨 위로 되돌린다", () => {
    const renderStep = (step: number) => (
      <PlatformShell header={<header>공통 헤더</header>} scrollResetKey={step}>
        {step}단계 콘텐츠
      </PlatformShell>
    );
    const { container, rerender } = render(renderStep(1));
    const content = container.querySelector<HTMLElement>('[data-platform-shell-content="true"]')!;
    // jsdom은 scrollTop을 항상 0으로 돌려주므로, 이전 단계에서 내려간 위치를 쓸 수 있는 값으로 대신함
    Object.defineProperty(content, "scrollTop", { value: 480, writable: true });

    rerender(renderStep(1));
    expect(content.scrollTop).toBe(480);

    rerender(renderStep(2));
    expect(content.scrollTop).toBe(0);
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
      ["/home", "홈", "document", "/assets/platform-navigation/home.png?v=18ffbf61c717"],
      ["/rag", "AI", "document", "/assets/platform-navigation/ai.png?v=40d07e5abe75"],
      ["/chat", "토론방", "client", "/assets/platform-navigation/chat.png?v=088425758cd1"],
      ["/vote", "투표", "client", "/assets/platform-navigation/vote.png?v=21e61dc6c498"],
      ["/mypage", "계정", "document", "/assets/platform-navigation/account.png?v=b19ca424bf3c"],
    ] as const;

    expectedItems.forEach(([href, label, navigationMode, iconSrc], index) => {
      const anchor = markup.match(new RegExp(`<a[^>]*href="${href}"[^>]*>`))?.[0];

      expect(anchor).toContain(`data-navigation-mode="${navigationMode}"`);
      expect(anchor).toContain(`data-platform-navigation-route="${href}"`);
      expect(markup).toContain(`>${label}</span>`);
      expect(markup).toContain(iconSrc);

      const previousItem = expectedItems[index - 1];

      if (previousItem) {
        expect(markup.indexOf(previousItem[1])).toBeLessThan(markup.indexOf(label));
      }
    });

    expect(markup.match(/aria-current="page"/g)).toHaveLength(1);
    expect(markup).toMatch(/aria-current="page"[^>]*href="\/vote"/);
  });
});

describe("content 맨 위로 이동", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("anchor가 화면에서 사라지면 header 아래 맨 위로 버튼을 보여 주고, 누르면 content를 맨 위로 올린다", () => {
    const intersectionObserver = stubIntersectionObserver();
    const { container } = render(<ScrollTopButtonFixture />);
    const content = container.querySelector<HTMLElement>('[data-platform-shell-content="true"]')!;
    const scrollTo = stubElementScrollTo(content);
    const button = screen.getByRole("button", { hidden: true, name: "맨 위로" });

    expect(
      container.querySelector('[data-platform-shell-content-top-action="true"]')?.contains(button),
    ).toBe(true);
    expect(button.dataset.visible).toBe("false");

    act(() => intersectionObserver.report(false));
    expect(button.dataset.visible).toBe("true");

    fireEvent.click(button);
    expect(scrollTo).toHaveBeenCalledWith({ behavior: "smooth", top: 0 });

    act(() => intersectionObserver.report(true));
    expect(button.dataset.visible).toBe("false");
  });

  it("움직임 줄이기를 켠 사용자에게는 애니메이션 없이 바로 맨 위로 이동한다", () => {
    const intersectionObserver = stubIntersectionObserver();
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
    const { container } = render(<ScrollTopButtonFixture />);
    const content = container.querySelector<HTMLElement>('[data-platform-shell-content="true"]')!;
    const scrollTo = stubElementScrollTo(content);

    act(() => intersectionObserver.report(false));
    fireEvent.click(screen.getByRole("button", { name: "맨 위로" }));

    expect(scrollTo).toHaveBeenCalledWith({ behavior: "auto", top: 0 });
  });

  it("투표 목록에서 하단 투표 메뉴를 다시 누르면 이동하지 않고 content를 맨 위로 올린다", () => {
    const { container } = render(
      <PlatformShell
        bottomNavigation={<PlatformNavigation currentPathname="/vote" />}
        header={<header>공통 헤더</header>}
      >
        도메인 콘텐츠
      </PlatformShell>,
    );
    const content = container.querySelector<HTMLElement>('[data-platform-shell-content="true"]')!;
    const scrollTo = stubElementScrollTo(content);

    fireEvent.click(screen.getByRole("link", { name: "투표" }));

    expect(scrollTo).toHaveBeenCalledWith({ behavior: "smooth", top: 0 });
  });

  it("투표 상세 같은 하위 경로에서는 하단 투표 메뉴가 스크롤을 올리지 않고 목록으로 이동한다", () => {
    const { container } = render(
      <PlatformShell
        bottomNavigation={<PlatformNavigation currentPathname="/vote/task-1" />}
        header={<header>공통 헤더</header>}
      >
        도메인 콘텐츠
      </PlatformShell>,
    );
    const content = container.querySelector<HTMLElement>('[data-platform-shell-content="true"]')!;
    const scrollTo = stubElementScrollTo(content);
    // 메뉴가 막지 않은 클릭은 jsdom이 구현하지 않은 문서 이동으로 이어지므로, 메뉴 처리가 끝난 뒤 문서 이동만 막음
    container.addEventListener("click", (event) => event.preventDefault());

    fireEvent.click(screen.getByRole("link", { name: "투표" }));

    expect(scrollTo).not.toHaveBeenCalled();
  });
});

function ScrollTopButtonFixture() {
  const anchorRef = useRef<HTMLDivElement>(null);

  return (
    <PlatformShell
      contentTopAction={<PlatformScrollTopButton anchorRef={anchorRef} />}
      header={<header>공통 헤더</header>}
    >
      <div ref={anchorRef}>검색 영역</div>
      <div>도메인 콘텐츠</div>
    </PlatformShell>
  );
}

function stubIntersectionObserver(): { report: (isIntersecting: boolean) => void } {
  let callback: IntersectionObserverCallback | null = null;

  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(nextCallback: IntersectionObserverCallback) {
        callback = nextCallback;
      }

      disconnect() {}

      observe() {}
    },
  );

  return {
    report: (isIntersecting) => {
      callback?.([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver);
    },
  };
}

// jsdom은 element.scrollTo로 스크롤 위치를 바꾸지 않으므로, 호출 인자만 확인할 수 있게 대신함
function stubElementScrollTo(element: HTMLElement) {
  const scrollTo = vi.fn();
  Object.defineProperty(element, "scrollTo", { configurable: true, value: scrollTo });
  return scrollTo;
}

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
