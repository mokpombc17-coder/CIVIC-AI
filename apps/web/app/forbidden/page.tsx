import type { Route } from "next";
import { redirect } from "next/navigation";
import { loadShellSession } from "@/lib/auth/require-session";
import { getScreenByRoute } from "@/lib/screens/registry";
import { MainFunctionalScreen } from "@/components/screens/main-functional-screen";
import { ParticipantShell } from "@/components/shell/participant-shell";
import { AdminShell } from "@/components/shell/admin-shell";

export default async function ForbiddenPage() {
  const session = await loadShellSession();
  if (!session || session.accountState !== "ACTIVE") redirect("/login" as Route);

  const screen = getScreenByRoute("/forbidden");
  if (!screen) throw new Error("COMMON-001 is missing from the screen registry.");

  return session.role === "PARTICIPANT" ? (
    <ParticipantShell activeRoute="/forbidden" title={screen.canonical_title}>
      <MainFunctionalScreen screen={screen} />
    </ParticipantShell>
  ) : (
    <AdminShell activeRoute="/forbidden" permissions={session.permissions} role={session.role}>
      <MainFunctionalScreen screen={screen} />
    </AdminShell>
  );
}
