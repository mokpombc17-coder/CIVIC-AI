import type { Route } from "next";
import type { ReactNode } from "react";
import { ParticipantEligibilityGuard } from "@/components/auth/participant-eligibility-guard";
import { PlatformPageShell } from "@/components/platform-page-shell";
import { PlatformNavigation } from "@/components/platform-shell";

type ParticipantShellProps = Readonly<{
  activeRoute: string;
  backHref?: Route;
  children: ReactNode;
  enforceServiceEligibility?: boolean;
  headerActions?: ReactNode;
  headerTitle?: ReactNode;
  requiresLoginForProtectedLinks?: boolean;
  title?: string;
}>;

export function ParticipantShell({
  activeRoute,
  backHref,
  children,
  enforceServiceEligibility = false,
  headerActions,
  headerTitle,
  requiresLoginForProtectedLinks = false,
  title,
}: ParticipantShellProps) {
  const section = participantSection(activeRoute);
  const resolvedBackHref = backHref ?? section.backHref;
  const backAction = resolvedBackHref
    ? { ariaLabel: "이전 화면으로 돌아가기", href: resolvedBackHref }
    : section.backDisabled
      ? { ariaLabel: "이전 화면으로 돌아가기", disabled: true as const }
      : undefined;
  const shell = (
    <PlatformPageShell
      {...(backAction ? { backAction } : {})}
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
  return enforceServiceEligibility ? (
    <ParticipantEligibilityGuard activeRoute={activeRoute}>{shell}</ParticipantEligibilityGuard>
  ) : (
    shell
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
  return normalizedRoute === section.root
    ? { ...(section.root === "/home" ? {} : { backDisabled: true }), title: section.title }
    : { title: section.title, backHref: section.root };
}
