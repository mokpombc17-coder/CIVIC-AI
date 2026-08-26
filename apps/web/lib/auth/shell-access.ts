export type ShellRole = "PARTICIPANT" | "ADMIN" | "HIGHEST_ADMIN";
export type ShellPermission = "RAG_ADMIN" | "CHAT_ADMIN" | "VOTE_ADMIN" | "SIMULATION_ADMIN";
export type ShellAccountState = "ACTIVE" | "INACTIVE" | "DELETED";

export type ShellSession = Readonly<{
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
  session: ShellSession | null,
  pathname?: string,
): ShellAccessDecision {
  if (!session || session.accountState !== "ACTIVE") return "REDIRECT_LOGIN";

  if (session.mustChangePassword) {
    return audience === "PARTICIPANT" && pathname?.split("?", 1)[0] === "/account/security"
      ? "ALLOW"
      : "FORBIDDEN";
  }

  if (audience === "PARTICIPANT") {
    return "ALLOW";
  }

  const isAdministrator = session.role === "ADMIN" || session.role === "HIGHEST_ADMIN";
  if (!isAdministrator) return "FORBIDDEN";
  if (audience === "ADMIN") return "ALLOW";
  if (audience === "HIGHEST_ADMIN") {
    return session.role === "HIGHEST_ADMIN" ? "ALLOW" : "FORBIDDEN";
  }
  return session.permissions.includes(audience) ? "ALLOW" : "FORBIDDEN";
}
