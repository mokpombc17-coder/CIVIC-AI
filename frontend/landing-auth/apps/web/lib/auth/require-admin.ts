import "server-only";

import type { Route } from "next";
import { redirect } from "next/navigation";
import { decideShellAccess, type CurrentUser, type ShellAudience } from "./shell-access";
import { loadCurrentUser } from "./require-access";
import { safeAdminReturnTarget } from "./return-target";

export async function requireAdminAccess(
  audience: Exclude<ShellAudience, "PARTICIPANT"> = "ADMIN",
  returnTo = "/admin",
): Promise<CurrentUser> {
  const currentUser = await loadCurrentUser();
  const decision = decideShellAccess(audience, currentUser);

  if (decision === "REDIRECT_LOGIN") {
    redirect(
      `/auth/refresh?returnTo=${encodeURIComponent(safeAdminReturnTarget(returnTo))}` as Route,
    );
  }
  if (decision === "FORBIDDEN") redirect("/forbidden");

  return currentUser as CurrentUser;
}
