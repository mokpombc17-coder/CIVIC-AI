export const platformNavigationItems = [
  {
    href: "/home",
    iconSrc: "/assets/platform-navigation/home.png?v=18ffbf61c717",
    label: "홈",
  },
  {
    href: "/rag",
    iconSrc: "/assets/platform-navigation/ai.png?v=40d07e5abe75",
    label: "AI",
  },
  {
    href: "/chat",
    iconSrc: "/assets/platform-navigation/chat.png?v=088425758cd1",
    label: "토론방",
  },
  {
    href: "/vote",
    iconSrc: "/assets/platform-navigation/vote.png?v=21e61dc6c498",
    label: "투표",
  },
  {
    href: "/mypage",
    iconSrc: "/assets/platform-navigation/account.png?v=b19ca424bf3c",
    label: "계정",
  },
] as const;

export type PlatformNavigationHref = (typeof platformNavigationItems)[number]["href"];

export const platformNavigationHrefs = platformNavigationItems.map(
  ({ href }) => href,
) as readonly PlatformNavigationHref[];

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

export function isPlatformNavigationItemActive(currentPathname: string, href: string): boolean {
  const pathname = currentPathname.replace(/^\/account(?=\/|$)/u, "/mypage");
  return pathname === href || pathname.startsWith(`${href}/`);
}
