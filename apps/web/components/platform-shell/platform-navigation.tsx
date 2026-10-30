"use client";

import type { CSSProperties, MouseEvent } from "react";
import {
  PlatformBottomNavigation,
  PlatformBottomNavigationItem,
} from "./platform-bottom-navigation";
import { usePlatformShellContentScroll } from "./platform-shell-content-scroll";
import styles from "./platform-shell.module.css";

type PlatformNavigationItem = Readonly<{
  href: string;
  iconSrc: string;
  label: string;
  navigationMode: "client" | "document";
  scrollToTopOnReselect?: boolean;
}>;

const PLATFORM_NAVIGATION_ITEMS: readonly PlatformNavigationItem[] = [
  {
    href: "/home",
    iconSrc: "/assets/platform-navigation/home.png?v=18ffbf61c717",
    label: "홈",
    navigationMode: "document",
  },
  {
    href: "/rag",
    iconSrc: "/assets/platform-navigation/ai.png?v=40d07e5abe75",
    label: "AI",
    navigationMode: "document",
  },
  {
    href: "/chat",
    iconSrc: "/assets/platform-navigation/chat.png?v=088425758cd1",
    label: "토론방",
    navigationMode: "client",
  },
  {
    href: "/vote",
    iconSrc: "/assets/platform-navigation/vote.png?v=21e61dc6c498",
    label: "투표",
    navigationMode: "client",
    scrollToTopOnReselect: true,
  },
  {
    href: "/mypage",
    iconSrc: "/assets/platform-navigation/account.png?v=b19ca424bf3c",
    label: "계정",
    navigationMode: "document",
  },
];

export type PlatformNavigationProps = Readonly<{
  currentPathname: string;
}>;

export function PlatformNavigation({ currentPathname }: PlatformNavigationProps) {
  const { scrollToTop } = usePlatformShellContentScroll();

  return (
    <PlatformBottomNavigation>
      {PLATFORM_NAVIGATION_ITEMS.map((item) => {
        // 목록 화면에 있을 때 같은 메뉴를 다시 누르면, 목록 주소로 다시 이동해 선택한 탭과 검색어를 초기화하는 대신 content 스크롤만 맨 위로 올림
        // 하위 경로(예: 투표 상세)에서 누르면 지금처럼 목록 주소로 이동함
        const scrollsToTopOnClick =
          item.scrollToTopOnReselect === true && currentPathname === item.href;
        const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
          if (!scrollsToTopOnClick) {
            return;
          }

          event.preventDefault();
          scrollToTop();
        };

        return (
          <PlatformBottomNavigationItem
            aria-current={
              isPlatformNavigationItemActive(currentPathname, item.href) ? "page" : undefined
            }
            href={item.href}
            icon={<PlatformNavigationIcon src={item.iconSrc} />}
            key={item.href}
            label={item.label}
            navigationMode={item.navigationMode}
            onClick={onClick}
          />
        );
      })}
    </PlatformBottomNavigation>
  );
}

export function isPlatformNavigationItemActive(currentPathname: string, href: string): boolean {
  return currentPathname === href || currentPathname.startsWith(`${href}/`);
}

function PlatformNavigationIcon({ src }: { src: string }) {
  return (
    <span
      className={styles.navigationIcon}
      style={{ "--platform-navigation-icon": `url("${src}")` } as CSSProperties}
    />
  );
}
