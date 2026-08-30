import type { Route } from "next";
import { notFound, redirect } from "next/navigation";
import { AdminChatRequestScreen } from "@/components/admin/admin-chat-request-screen";
import { AdminChatInsightsScreen } from "@/components/admin/admin-chat-insights-screen";
import { AdminRoomCategoryScreen } from "@/components/admin/admin-room-category-screen";
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

  if (definition.id === "A-TASK-003") {
    redirect(`/admin/tasks${serializeSearchParams(query)}`);
  }

  const userDrawerTab = userDrawerTabForScreen(definition.id);
  if (userDrawerTab) redirect(userDrawerHref(query, userDrawerTab));

  if (definition.id === "A-CHAT-005" || definition.id === "A-CHAT-006") {
    redirect(chatRequestDrawerHref(query, definition.id === "A-CHAT-006"));
  }

  if (definition.status === "FUNCTIONAL" && definition.owner === "MAIN_AUTH") {
    return <MainFunctionalScreen adminCurrentUser={currentUser} screen={definition} />;
  }

  if (definition.status === "FUNCTIONAL" && definition.owner === "RAG") {
    return <RagFunctionalScreen query={query} screen={definition} />;
  }

  if (definition.status === "FUNCTIONAL" && definition.owner === "CHAT") {
    if (definition.id === "A-CHAT-007") return <AdminRoomCategoryScreen screen={definition} />;
    if (["A-CHAT-001", "A-CHAT-002", "A-CHAT-008", "A-CHAT-009"].includes(definition.id)) {
      return <AdminChatInsightsScreen screen={definition} />;
    }
    return <AdminChatRequestScreen query={query} screen={definition} />;
  }

  if (definition.status === "FUNCTIONAL" && definition.owner === "DECISION") {
    return <AdminTaskScreen query={query} screen={definition} />;
  }

  if (definition.status === "FUNCTIONAL" && definition.owner === "SIMULATION") {
    return <AdminSimulationScreen query={query} screen={definition} />;
  }

  if (definition.status !== "PLACEHOLDER") notFound();

  return <ComingSoonScreen screen={definition} />;
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

function userDrawerTabForScreen(screenId: string): "account" | "access" | "audit" | null {
  if (screenId === "A-USER-002") return "account";
  if (screenId === "A-USER-003" || screenId === "A-USER-004") return "access";
  if (screenId === "A-USER-005") return "audit";
  return null;
}

function userDrawerHref(query: RagQuery, tab: "account" | "access" | "audit"): Route {
  const userId = typeof query.userId === "string" ? query.userId : query.userId?.[0];
  if (!userId) return "/admin/users" as Route;
  const params = new URLSearchParams({ userId, tab });
  return `/admin/users?${params.toString()}` as Route;
}

function chatRequestDrawerHref(query: RagQuery, rejectMode: boolean): Route {
  const requestId = typeof query.requestId === "string" ? query.requestId : query.requestId?.[0];
  if (!requestId) return "/admin/chat/requests" as Route;
  const params = new URLSearchParams({ requestId });
  if (rejectMode) params.set("decision", "reject");
  return `/admin/chat/requests?${params.toString()}` as Route;
}
