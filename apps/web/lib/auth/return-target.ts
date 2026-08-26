export function safeReturnTarget(candidate: string, fallback = "/home"): string {
  try {
    const base = new URL("https://civic.invalid");
    const target = new URL(candidate, base);
    if (
      !candidate.startsWith("/") ||
      candidate.startsWith("//") ||
      candidate.includes("\\") ||
      target.origin !== base.origin ||
      target.pathname === "/login" ||
      target.pathname === "/auth/refresh"
    ) {
      return fallback;
    }
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}

export function safeAdminReturnTarget(candidate: string): string {
  try {
    const base = new URL("https://civic.invalid");
    const target = new URL(candidate, base);
    if (
      target.origin !== base.origin ||
      (target.pathname !== "/admin" && !target.pathname.startsWith("/admin/")) ||
      candidate.startsWith("//") ||
      candidate.includes("\\")
    ) {
      return "/admin";
    }
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "/admin";
  }
}
