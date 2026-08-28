import type { Route } from "next";
import type { ReactNode } from "react";
import { PlatformPageShell } from "@/components/platform-page-shell";
import { PlatformNavigation } from "@/components/platform-shell";

type ParticipantShellProps = Readonly<{
  activeRoute: string;
  backHref?: Route;
  children: ReactNode;
  headerActions?: ReactNode;
  headerTitle?: ReactNode;
  requiresLoginForProtectedLinks?: boolean;
  title?: string;
}>;

export function ParticipantShell({
  activeRoute,
  backHref,
  children,
  headerActions,
  headerTitle,
  requiresLoginForProtectedLinks = false,
  title,
}: ParticipantShellProps) {
  const section = participantSection(activeRoute);
  const resolvedBackHref = backHref ?? section.backHref;
  return (
    <PlatformPageShell
      {...(resolvedBackHref
        ? {
            backAction: { ariaLabel: "이전 화면으로 돌아가기", href: resolvedBackHref },
          }
        : {})}
      bottomNavigation={
        <PlatformNavigation
          currentPathname={activeRoute}
          requiresLoginForProtectedLinks={requiresLoginForProtectedLinks}
        />
      }
      contentClassName="civic-platform-participant-content"
      {...(headerActions !== undefined ? { headerActions } : {})}
      title={headerTitle ?? title ?? section.title}
    >
      <a className="civic-skip-link" href="#civic-content">
        본문 바로가기
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

function participantSection(activeRoute: string): Readonly<{ title: string; backHref?: Route }> {
  const [segment] = activeRoute.split("/").filter(Boolean);
  const section =
    segment === "rag"
      ? { root: "/rag" as Route, title: "AI" }
      : segment === "chat"
        ? { root: "/chat" as Route, title: "토론방" }
        : segment === "vote" || segment === "votes"
          ? { root: "/vote" as Route, title: "투표" }
          : segment === "mypage" || segment === "account"
            ? { root: "/mypage" as Route, title: "계정" }
            : segment === "forbidden"
              ? { root: "/home" as Route, title: "접근 제한" }
              : { root: "/home" as Route, title: "홈" };

  const normalizedRoute = activeRoute
    .replace(/^\/votes(?=\/|$)/u, "/vote")
    .replace(/^\/account(?=\/|$)/u, "/mypage");
  return normalizedRoute === section.root
    ? { title: section.title }
    : { title: section.title, backHref: section.root };
}
