import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { ParticipantShell } from "@/components/shell/participant-shell";
import { ComingSoonScreen } from "@/components/screens/coming-soon-screen";
import { MainFunctionalScreen } from "@/components/screens/main-functional-screen";
import { requireParticipantAccess } from "@/lib/auth/require-access";
import { AdminShell } from "@/components/shell/admin-shell";
import { getScreenByRoute } from "@/lib/screens/registry";
import { RagFunctionalScreen, type RagQuery } from "@/components/rag/rag-functional-screen";
import { RagNewQuestionHeaderAction } from "@/components/rag/rag-new-question-header-action";
import { ragReturnTarget } from "@/lib/auth/rag-return-target";
import { screenFrameHeading } from "@/components/screens/screen-frame";
import { devQuickLoginAvailable, readDevQuickLoginConfig } from "@/lib/server/dev-quick-login";
import { PublicAuthScreen } from "@/components/screens/public-auth-screen";

type ParticipantPlaceholderPageProps = Readonly<{
  params: Promise<{ feature: string; screen?: string[] }>;
  searchParams: Promise<RagQuery>;
}>;

export default async function ParticipantPlaceholderPage({
  params,
  searchParams,
}: ParticipantPlaceholderPageProps) {
  const { feature, screen = [] } = await params;
  const query = await searchParams;
  const pathname = `/${[feature, ...screen].join("/")}`;
  const definition = getScreenByRoute(pathname);

  if (!definition) notFound();
  const heading = screenFrameHeading(definition);

  if (definition.status === "FUNCTIONAL" && definition.owner === "MAIN_AUTH") {
    if (definition.audience === "PUBLIC") {
      const requestHeaders = await headers();
      const devQuickLoginEnabled =
        definition.id === "AUTH-001" &&
        devQuickLoginAvailable(requestHeaders.get("host"), readDevQuickLoginConfig(process.env));
      return (
        <PublicAuthScreen
          devQuickLoginEnabled={devQuickLoginEnabled}
          initialSearch={serializeSearchParams(query)}
          key={definition.id}
          screen={definition}
        />
      );
    }
    if (definition.audience === "PARTICIPANT") {
      await requireParticipantAccess(pathname);
      return (
        <ParticipantShell
          {...(heading.backHref ? { backHref: heading.backHref } : {})}
          activeRoute={pathname}
          title={heading.title}
        >
          <MainFunctionalScreen screen={definition} />
        </ParticipantShell>
      );
    }
    if (definition.audience === "AUTHENTICATED") {
      const currentUser = await requireParticipantAccess(pathname);
      return currentUser.role === "PARTICIPANT" ? (
        <ParticipantShell
          {...(heading.backHref ? { backHref: heading.backHref } : {})}
          activeRoute={pathname}
          title={heading.title}
        >
          <MainFunctionalScreen screen={definition} />
        </ParticipantShell>
      ) : (
        <AdminShell
          activeRoute={pathname}
          permissions={currentUser.permissions}
          role={currentUser.role}
        >
          <MainFunctionalScreen screen={definition} />
        </AdminShell>
      );
    }
  }

  if (definition.status === "FUNCTIONAL" && definition.owner === "RAG") {
    const currentUser = await requireParticipantAccess(ragReturnTarget(pathname, query));
    return (
      <ParticipantShell
        {...(heading.backHref ? { backHref: heading.backHref } : {})}
        activeRoute={pathname}
        {...(definition.id === "U-RAG-001"
          ? { headerActions: <RagNewQuestionHeaderAction /> }
          : {})}
        title={heading.title}
      >
        <RagFunctionalScreen query={query} screen={definition} userId={currentUser.userId} />
      </ParticipantShell>
    );
  }

  if (definition.status !== "PLACEHOLDER" || definition.audience !== "PARTICIPANT") notFound();

  await requireParticipantAccess(pathname);

  return (
    <ParticipantShell activeRoute={pathname} title={participantPlaceholderTitle(pathname)}>
      <ComingSoonScreen screen={definition} />
    </ParticipantShell>
  );
}

function participantPlaceholderTitle(pathname: string): string {
  if (pathname.startsWith("/chat")) return "토론방";
  if (pathname.startsWith("/vote")) return "투표";
  return "홈";
}

function serializeSearchParams(query: RagQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string") params.set(key, value);
    else if (Array.isArray(value)) for (const item of value) params.append(key, item);
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}
