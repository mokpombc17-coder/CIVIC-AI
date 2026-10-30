export type ShellRole = "PARTICIPANT" | "ADMIN" | "HIGHEST_ADMIN";
export type ShellPermission = "RAG_ADMIN" | "CHAT_ADMIN" | "VOTE_ADMIN" | "SIMULATION_ADMIN";
export type ShellAccountState = "ACTIVE" | "INACTIVE" | "DELETED";

export type CurrentUser = Readonly<{
  userId: string;
  role: ShellRole;
  permissions: readonly ShellPermission[];
  accountState: ShellAccountState;
  mustChangePassword: boolean;
}>;

export type ShellAudience = "PARTICIPANT" | "ADMIN" | "HIGHEST_ADMIN" | ShellPermission;
export type ShellAccessDecision = "ALLOW" | "REDIRECT_LOGIN" | "FORBIDDEN";

export function decideShellAccess(
  audience: ShellAudience,
  currentUser: CurrentUser | null,
  pathname?: string,
): ShellAccessDecision {
  if (!currentUser || currentUser.accountState !== "ACTIVE") return "REDIRECT_LOGIN";

  if (currentUser.mustChangePassword) {
    return audience === "PARTICIPANT" && pathname?.split("?", 1)[0] === "/account/security"
      ? "ALLOW"
      : "FORBIDDEN";
  }

  if (audience === "PARTICIPANT") {
    return "ALLOW";
  }

  const isAdministrator = currentUser.role === "ADMIN" || currentUser.role === "HIGHEST_ADMIN";
  if (!isAdministrator) return "FORBIDDEN";
  if (audience === "ADMIN") return "ALLOW";
  if (audience === "HIGHEST_ADMIN") {
    return currentUser.role === "HIGHEST_ADMIN" ? "ALLOW" : "FORBIDDEN";
  }
  return currentUser.permissions.includes(audience) ? "ALLOW" : "FORBIDDEN";
}
