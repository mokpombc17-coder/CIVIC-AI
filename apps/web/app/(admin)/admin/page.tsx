import { AdminShell } from "@/components/shell/admin-shell";
import { MainFunctionalScreen } from "@/components/screens/main-functional-screen";
import { requireAdminSession } from "@/lib/auth/require-admin";
import { getScreenByRoute } from "@/lib/screens/registry";

export default async function AdminHomePage() {
  const session = await requireAdminSession();
  const screen = getScreenByRoute("/admin");
  if (!screen) throw new Error("A-HOME-001 is missing from the screen registry.");
  return (
    <AdminShell activeRoute="/admin" permissions={session.permissions} role={session.role}>
      <MainFunctionalScreen adminSession={session} screen={screen} />
    </AdminShell>
  );
}
