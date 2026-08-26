import "server-only";

import type { Route } from "next";
import { redirect } from "next/navigation";
import { decideShellAccess, type ShellAudience, type ShellSession } from "./shell-access";
import { loadShellSession } from "./require-session";
import { safeAdminReturnTarget } from "./return-target";

export async function requireAdminSession(
  audience: Exclude<ShellAudience, "PARTICIPANT"> = "ADMIN",
  returnTo = "/admin",
): Promise<ShellSession> {
  const session = await loadShellSession();
  const decision = decideShellAccess(audience, session);

  if (decision === "REDIRECT_LOGIN") {
    redirect(
      `/auth/refresh?returnTo=${encodeURIComponent(safeAdminReturnTarget(returnTo))}` as Route,
    );
  }
  if (decision === "FORBIDDEN") redirect("/forbidden");

  return session as ShellSession;
}
