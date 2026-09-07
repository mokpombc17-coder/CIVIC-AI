import type { CSSProperties } from "react";
import {
  PlatformBottomNavigation,
  PlatformBottomNavigationItem,
} from "./platform-bottom-navigation";
import styles from "./platform-shell.module.css";

const PLATFORM_NAVIGATION_ITEMS = [
  {
    href: "/home",
    iconSrc: "/assets/platform-navigation/home.png",
    label: "홈",
  },
  {
    href: "/rag",
    iconSrc: "/assets/platform-navigation/ai.png",
    label: "AI",
  },
  {
    href: "/chat",
    iconSrc: "/assets/platform-navigation/chat.png",
    label: "토론방",
  },
  {
    href: "/vote",
    iconSrc: "/assets/platform-navigation/vote.png",
    label: "투표",
  },
  {
    href: "/mypage",
    iconSrc: "/assets/platform-navigation/account.png",
    label: "계정",
  },
] as const;

export type PlatformNavigationProps = Readonly<{
  currentPathname: string;
  requiresLoginForProtectedLinks?: boolean;
}>;

type PlatformNavigationHref = (typeof PLATFORM_NAVIGATION_ITEMS)[number]["href"];

export function resolvePlatformNavigationTarget(
  href: PlatformNavigationHref,
  requiresLogin: boolean,
): Readonly<{ href: string; navigationMode: "client" | "document" }> {
  if (requiresLogin && href !== "/home") {
    return {
      href: `/login?returnTo=${encodeURIComponent(href)}`,
      navigationMode: "client",
    };
  }

  return {
    href,
    navigationMode: href === "/chat" || href === "/vote" ? "document" : "client",
  };
}

export function PlatformNavigation({
  currentPathname,
  requiresLoginForProtectedLinks = false,
}: PlatformNavigationProps) {
  return (
    <PlatformBottomNavigation>
      {PLATFORM_NAVIGATION_ITEMS.map((item) => {
        const target = resolvePlatformNavigationTarget(item.href, requiresLoginForProtectedLinks);

        return (
          <PlatformBottomNavigationItem
            aria-current={
              isPlatformNavigationItemActive(currentPathname, item.href) ? "page" : undefined
            }
            href={target.href}
            icon={<PlatformNavigationIcon src={item.iconSrc} />}
            key={item.href}
            label={item.label}
            navigationMode={target.navigationMode}
          />
        );
      })}
    </PlatformBottomNavigation>
  );
}

export function isPlatformNavigationItemActive(currentPathname: string, href: string): boolean {
  const pathname = currentPathname.replace(/^\/account(?=\/|$)/u, "/mypage");
  return pathname === href || pathname.startsWith(`${href}/`);
}

function PlatformNavigationIcon({ src }: { src: string }) {
  return (
    <span
      className={styles.navigationIcon}
      style={{ "--platform-navigation-icon": `url("${src}")` } as CSSProperties}
    />
  );
}
