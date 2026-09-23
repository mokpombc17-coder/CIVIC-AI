import type { CSSProperties } from "react";
import {
  PlatformBottomNavigation,
  PlatformBottomNavigationItem,
} from "./platform-bottom-navigation";
import styles from "./platform-shell.module.css";

const PLATFORM_NAVIGATION_ITEMS = [
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
  },
  {
    href: "/mypage",
    iconSrc: "/assets/platform-navigation/account.png?v=b19ca424bf3c",
    label: "계정",
    navigationMode: "document",
  },
] as const;

export type PlatformNavigationProps = Readonly<{
  currentPathname: string;
}>;

export function PlatformNavigation({ currentPathname }: PlatformNavigationProps) {
  return (
    <PlatformBottomNavigation>
      {PLATFORM_NAVIGATION_ITEMS.map((item) => (
        <PlatformBottomNavigationItem
          aria-current={
            isPlatformNavigationItemActive(currentPathname, item.href) ? "page" : undefined
          }
          href={item.href}
          icon={<PlatformNavigationIcon src={item.iconSrc} />}
          key={item.href}
          label={item.label}
          navigationMode={item.navigationMode}
        />
      ))}
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
