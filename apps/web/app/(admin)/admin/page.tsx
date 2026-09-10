import { AdminFunctionalScreen } from "@/components/screens/admin-functional-screen";
import { requireAdminAccess } from "@/lib/auth/require-admin";
import { getScreenByRoute } from "@/lib/screens/registry";

export default async function AdminHomePage() {
  const currentUser = await requireAdminAccess();
  const screen = getScreenByRoute("/admin");
  if (!screen) throw new Error("A-HOME-001 is missing from the screen registry.");
  return <AdminFunctionalScreen adminCurrentUser={currentUser} screen={screen} />;
}
