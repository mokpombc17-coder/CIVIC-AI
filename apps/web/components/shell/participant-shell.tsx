import type { Route } from "next";
import type { ReactNode } from "react";
import { PlatformPageShell } from "@/components/platform-page-shell";
import { PlatformNavigation, type PlatformShellScroll } from "@/components/platform-shell";

export type ParticipantShellProps = Readonly<{
  activeRoute: string;
  backHref?: Route;
  bottomNavigation?: ReactNode;
  children: ReactNode;
  headerActions?: ReactNode;
  headerTitle?: ReactNode;
  requiresLoginForProtectedLinks?: boolean;
  scroll?: PlatformShellScroll;
  title?: string;
}>;

export function ParticipantShell({
  activeRoute,
  backHref,
  bottomNavigation,
  children,
  headerActions,
  headerTitle,
  requiresLoginForProtectedLinks = false,
  scroll = "self",
  title,
}: ParticipantShellProps) {
  const section = participantSection(activeRoute);
  const resolvedBackHref = backHref ?? section.backHref;
  const backAction = resolvedBackHref
    ? { ariaLabel: "이전 화면으로 돌아가기", href: resolvedBackHref }
    : section.backDisabled
      ? { ariaLabel: "이전 화면으로 돌아가기", disabled: true as const }
      : undefined;

  return (
    <PlatformPageShell
      {...(backAction ? { backAction } : {})}
      bottomNavigation={
        bottomNavigation === undefined ? (
          <PlatformNavigation
            currentPathname={activeRoute}
            requiresLoginForProtectedLinks={requiresLoginForProtectedLinks}
          />
        ) : (
          bottomNavigation
        )
      }
      contentClassName="civic-platform-participant-content"
      {...(headerActions !== undefined ? { headerActions } : {})}
      scroll={scroll}
      title={headerTitle ?? title ?? section.title}
    >
      <a className="civic-skip-link" href="#civic-content">
        <span data-nosnippet="">본문 바로가기</span>
      </a>
      <div
        className="civic-platform-participant-body"
        data-participant-surface="true"
        id="civic-content"
      >
        {children}
      </div>
    </PlatformPageShell>
  );
}

function participantSection(
  activeRoute: string,
): Readonly<{ backDisabled?: boolean; backHref?: Route; title: string }> {
  const [segment] = activeRoute.split("/").filter(Boolean);
  const section =
    segment === "rag"
      ? { root: "/rag" as Route, title: "AI" }
      : segment === "chat"
        ? { root: "/chat" as Route, title: "토론방" }
        : segment === "vote"
          ? { root: "/vote" as Route, title: "투표" }
          : segment === "mypage" || segment === "account"
            ? { root: "/mypage" as Route, title: "계정" }
            : segment === "forbidden"
              ? { root: "/home" as Route, title: "접근 제한" }
              : { root: "/home" as Route, title: "홈" };

  const normalizedRoute = activeRoute.replace(/^\/account(?=\/|$)/u, "/mypage");
  if (normalizedRoute !== section.root) {
    return { title: section.title, backHref: section.root };
  }
  if (/^\/(?:rag|mypage)$/u.test(normalizedRoute)) {
    return { title: section.title, backHref: "/home" as Route };
  }
  return { ...(section.root === "/home" ? {} : { backDisabled: true }), title: section.title };
}
