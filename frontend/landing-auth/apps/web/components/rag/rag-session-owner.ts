export async function readRagSessionOwner(
  ownerUserId: string,
  signal: AbortSignal,
  request: typeof fetch = fetch,
): Promise<"current" | "changed" | "expired" | "unavailable"> {
  try {
    const response = await request("/api/v1/auth/me", {
      cache: "no-store",
      credentials: "same-origin",
      signal,
    });
    if (response.status === 401) return "expired";
    if (!response.ok) return "unavailable";
    const user: unknown = await response.json();
    if (
      !user ||
      typeof user !== "object" ||
      !("user_id" in user) ||
      typeof user.user_id !== "string" ||
      !user.user_id ||
      !("account_state" in user) ||
      !["ACTIVE", "INACTIVE", "DELETED"].includes(String(user.account_state))
    )
      return "unavailable";
    return user.user_id === ownerUserId && user.account_state === "ACTIVE" ? "current" : "changed";
  } catch {
    return "unavailable";
  }
}
