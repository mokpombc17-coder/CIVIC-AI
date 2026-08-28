import { notFound } from "next/navigation";
import { AdminShell } from "@/components/shell/admin-shell";
import { AdminChatRequestScreen } from "@/components/admin/admin-chat-request-screen";
import { AdminTaskScreen } from "@/components/admin/admin-task-screen";
import { AdminSimulationScreen } from "@/components/admin/admin-simulation-screen";
import { ComingSoonScreen } from "@/components/screens/coming-soon-screen";
import { MainFunctionalScreen } from "@/components/screens/main-functional-screen";
import { requireAdminAccess } from "@/lib/auth/require-admin";
import { getScreenByRoute } from "@/lib/screens/registry";
import { RagFunctionalScreen, type RagQuery } from "@/components/rag/rag-functional-screen";
import type { ShellAudience } from "@/lib/auth/shell-access";

type AdminPlaceholderPageProps = Readonly<{
  params: Promise<{ feature: string; screen?: string[] }>;
  searchParams: Promise<RagQuery>;
}>;

export default async function AdminPlaceholderPage({
  params,
  searchParams,
}: AdminPlaceholderPageProps) {
  const { feature, screen = [] } = await params;
  const query = await searchParams;
  const pathname = `/admin/${[feature, ...screen].join("/")}`;
  const definition = getScreenByRoute(pathname);

  if (!definition || definition.audience !== "ADMIN") notFound();

  const currentUser = await requireAdminAccess(
    adminAudience(definition.owner, definition.id),
    `${pathname}${serializeSearchParams(query)}`,
  );

  if (definition.status === "FUNCTIONAL" && definition.owner === "MAIN_AUTH") {
    return (
      <AdminShell
        activeRoute={pathname}
        permissions={currentUser.permissions}
        role={currentUser.role}
      >
        <MainFunctionalScreen adminCurrentUser={currentUser} screen={definition} />
      </AdminShell>
    );
  }

  if (definition.status === "FUNCTIONAL" && definition.owner === "RAG") {
    return (
      <AdminShell
        activeRoute={pathname}
        permissions={currentUser.permissions}
        role={currentUser.role}
      >
        <RagFunctionalScreen query={query} screen={definition} />
      </AdminShell>
    );
  }

  if (definition.status === "FUNCTIONAL" && definition.owner === "CHAT") {
    return (
      <AdminShell
        activeRoute={pathname}
        permissions={currentUser.permissions}
        role={currentUser.role}
      >
        <AdminChatRequestScreen query={query} screen={definition} />
      </AdminShell>
    );
  }

  if (definition.status === "FUNCTIONAL" && definition.owner === "DECISION") {
    return (
      <AdminShell
        activeRoute={pathname}
        permissions={currentUser.permissions}
        role={currentUser.role}
      >
        <AdminTaskScreen query={query} screen={definition} />
      </AdminShell>
    );
  }

  if (definition.status === "FUNCTIONAL" && definition.owner === "SIMULATION") {
    return (
      <AdminShell
        activeRoute={pathname}
        permissions={currentUser.permissions}
        role={currentUser.role}
      >
        <AdminSimulationScreen query={query} screen={definition} />
      </AdminShell>
    );
  }

  if (definition.status !== "PLACEHOLDER") notFound();

  return (
    <AdminShell
      activeRoute={pathname}
      permissions={currentUser.permissions}
      role={currentUser.role}
    >
      <ComingSoonScreen screen={definition} />
    </AdminShell>
  );
}

function adminAudience(owner: string, screenId: string): Exclude<ShellAudience, "PARTICIPANT"> {
  if (screenId.startsWith("A-USER-")) return "HIGHEST_ADMIN";
  if (owner === "RAG") return "RAG_ADMIN";
  if (owner === "CHAT") return "CHAT_ADMIN";
  if (owner === "DECISION") return "VOTE_ADMIN";
  if (owner === "SIMULATION") return "SIMULATION_ADMIN";
  return "ADMIN";
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
