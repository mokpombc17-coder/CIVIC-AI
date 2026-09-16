import type { ReactNode } from "react";
import "../../wireflow.css";
import "../../admin-console.css";
import { AdminShell } from "@/components/shell/admin-shell";
import { requireAdminAccess } from "@/lib/auth/require-admin";

/** 사이드바를 레이아웃에서 렌더해 라우트 전환·로딩 중에도 고정한다. */
export default async function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  const currentUser = await requireAdminAccess();
  return (
    <AdminShell permissions={currentUser.permissions} role={currentUser.role}>
      {children}
    </AdminShell>
  );
}
