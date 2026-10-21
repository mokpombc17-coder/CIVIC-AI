// User/permission domain helpers shared by the admin user console.
// Moved out of admin-functional-screen.tsx so the console workspace can
// import them without a circular module dependency; admin-functional-screen
// re-exports everything for backwards compatibility.

import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";

export type AdminUser = {
  user_id: string;
  email: string;
  account_state: string;
  roles: string[];
  permissions: string[];
  row_version: number;
  must_change_password: boolean;
  email_verified_at?: string | null;
  last_activity_at?: string | null;
};

export type AuditEvent = {
  event_id: string;
  event_type: string;
  actor_id: string;
  occurred_at: string;
  request_id: string;
  subject_id?: string | null;
  before_roles?: string[];
  after_roles?: string[];
  before_permissions?: string[];
  after_permissions?: string[];
  reason?: string;
};

export type UserStatusFilter = "all" | "active" | "inactive" | "admin";
export type AdminRoleChoice = "PARTICIPANT" | "ADMIN" | "HIGHEST_ADMIN";

export const ADMIN_PERMISSION_CODES = [
  "RAG_ADMIN",
  "CHAT_ADMIN",
  "VOTE_ADMIN",
  "SIMULATION_ADMIN",
] as const;

export const ADMIN_ROLE_CHOICES: ReadonlyArray<
  Readonly<{ description: string; label: string; value: AdminRoleChoice }>
> = [
  {
    value: "PARTICIPANT",
    label: "사용자",
    description: "관리자 역할과 운영 권한을 모두 해제합니다.",
  },
  {
    value: "ADMIN",
    label: "운영 관리자",
    description: "담당 업무에 필요한 운영 권한을 선택합니다.",
  },
  {
    value: "HIGHEST_ADMIN",
    label: "최고 관리자",
    description: "모든 운영 권한이 자동으로 부여됩니다.",
  },
];

export function filterAdminUsers(users: AdminUser[], filter: UserStatusFilter) {
  if (filter === "active") return users.filter((user) => user.account_state === "ACTIVE");
  if (filter === "inactive") return users.filter((user) => user.account_state !== "ACTIVE");
  if (filter === "admin") {
    return users.filter((user) =>
      user.roles.some((role) => role === "ADMIN" || role === "HIGHEST_ADMIN"),
    );
  }
  return users;
}

export async function loadRequestedAdminUser(
  userId: string,
  request: typeof fetch = authenticatedFetch,
): Promise<AdminUser | null> {
  try {
    const response = await request(`/api/v1/admin/users/${encodeURIComponent(userId)}`, {
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as AdminUser;
  } catch {
    return null;
  }
}

export function adminRoleMutationPath(userId: string): string {
  return `/api/v1/admin/users/${encodeURIComponent(userId)}/roles`;
}

export async function loadRoleConflictUser(
  status: number,
  userId: string,
  request: typeof fetch = authenticatedFetch,
): Promise<AdminUser | null> {
  return status === 409 ? loadRequestedAdminUser(userId, request) : null;
}

export type AdminUserPage = {
  items: AdminUser[];
  /** Matching users on the server; null when the server does not report a total. */
  total: number | null;
  nextCursor: string | null;
};

export const ADMIN_USER_PAGE_SIZE = 100;

export function adminUserListPath(
  query: string,
  status: UserStatusFilter = "all",
  cursor: string | null = null,
): string {
  const params = new URLSearchParams({ query, status, limit: String(ADMIN_USER_PAGE_SIZE) });
  if (cursor) params.set("cursor", cursor);
  return `/api/v1/admin/users?${params.toString()}`;
}

export async function requestAdminUsers(
  query: string,
  request: typeof fetch = authenticatedFetch,
  status: UserStatusFilter = "all",
  cursor: string | null = null,
): Promise<AdminUserPage | null> {
  try {
    const response = await request(adminUserListPath(query, status, cursor), {
      cache: "no-store",
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      items?: unknown;
      next_cursor?: unknown;
      total?: unknown;
    };
    if (!Array.isArray(data.items)) return null;
    return {
      items: data.items as AdminUser[],
      total: typeof data.total === "number" ? data.total : null,
      nextCursor:
        typeof data.next_cursor === "string" && data.next_cursor ? data.next_cursor : null,
    };
  } catch {
    return null;
  }
}

/** Appends the next page without duplicating users already shown. */
export function appendAdminUserPage(current: AdminUser[], next: AdminUser[]): AdminUser[] {
  const seen = new Set(current.map((user) => user.user_id));
  return [...current, ...next.filter((user) => !seen.has(user.user_id))];
}

/** main-auth returns only this many newest audit events, with no paging. */
export const ADMIN_AUDIT_SERVER_WINDOW = 100;

export type AdminAuditWindow = {
  items: AuditEvent[];
  /** The server window was full, so older events (and older subject history) are not included. */
  windowFull: boolean;
};

export async function requestAdminAuditWindow(
  subjectId: string | undefined,
  request: typeof fetch = authenticatedFetch,
): Promise<AdminAuditWindow | null> {
  try {
    const response = await request("/api/v1/admin/audit", { cache: "no-store" });
    if (!response.ok) return null;
    const data = (await response.json()) as { items?: unknown };
    if (!Array.isArray(data.items)) return null;
    const items = data.items as AuditEvent[];
    return {
      items: subjectId ? items.filter((event) => event.subject_id === subjectId) : items,
      windowFull: items.length >= ADMIN_AUDIT_SERVER_WINDOW,
    };
  } catch {
    return null;
  }
}

export async function requestAdminAudit(
  subjectId: string | undefined,
  request: typeof fetch = authenticatedFetch,
): Promise<AuditEvent[] | null> {
  return (await requestAdminAuditWindow(subjectId, request))?.items ?? null;
}

export function selectedAdminRole(roles: readonly string[]): AdminRoleChoice {
  if (roles.includes("HIGHEST_ADMIN")) return "HIGHEST_ADMIN";
  if (roles.includes("ADMIN")) return "ADMIN";
  return "PARTICIPANT";
}

export function permissionsForAdminRole(
  role: AdminRoleChoice,
  permissions: readonly string[],
): string[] {
  if (role === "HIGHEST_ADMIN") return [...ADMIN_PERMISSION_CODES];
  if (role === "PARTICIPANT") return [];
  return ADMIN_PERMISSION_CODES.filter((permission) => permissions.includes(permission));
}

export function hasAdminAccessRevocation(
  currentRoles: readonly string[],
  currentPermissions: readonly string[],
  nextRoles: readonly string[],
  nextPermissions: readonly string[],
): boolean {
  const nextRoleSet = new Set(nextRoles);
  const nextPermissionSet = new Set(nextPermissions);
  return (
    currentRoles.some(
      (role) => (role === "ADMIN" || role === "HIGHEST_ADMIN") && !nextRoleSet.has(role),
    ) || currentPermissions.some((permission) => !nextPermissionSet.has(permission))
  );
}

export function isAdminRoleChoice(value: unknown): value is AdminRoleChoice {
  return value === "PARTICIPANT" || value === "ADMIN" || value === "HIGHEST_ADMIN";
}

export function auditSubjectHref(subjectId: string | null | undefined): string | null {
  return subjectId ? `/admin/users/detail?userId=${encodeURIComponent(subjectId)}` : null;
}

export function userRoute(
  path: string,
  selected: AdminUser | null,
): { pathname: string; query?: { userId: string } } {
  return selected ? { pathname: path, query: { userId: selected.user_id } } : { pathname: path };
}

export function userBackHref(path: string, selected: AdminUser | null): string {
  return selected ? `${path}?userId=${encodeURIComponent(selected.user_id)}` : path;
}

export function createMutationLock() {
  let pending = false;
  return {
    tryBegin(): boolean {
      if (pending) return false;
      pending = true;
      return true;
    },
    end(): void {
      pending = false;
    },
  };
}

export function createLatestAdminUserRequestGate() {
  let generation = 0;
  return {
    begin(): () => boolean {
      generation += 1;
      const current = generation;
      return () => current === generation;
    },
    cancel(): void {
      generation += 1;
    },
  };
}

export function roleFormKey(selected: AdminUser | null, screenId: string): string {
  return selected
    ? `${screenId}:${selected.user_id}:${selected.row_version}`
    : `${screenId}:loading`;
}

export function accountStateLabel(state: string): string {
  return (
    {
      ACTIVE: "활성",
      INACTIVE: "비활성",
      DELETED: "삭제됨",
      PENDING_EMAIL_VERIFICATION: "이메일 인증 대기",
    }[state] ?? state
  );
}

export function roleLabel(role: string): string {
  return (
    {
      PARTICIPANT: "사용자",
      ADMIN: "운영 관리자",
      HIGHEST_ADMIN: "최고 관리자",
    }[role] ?? role
  );
}

export function permissionLabel(permission: string): string {
  return (
    {
      RAG_ADMIN: "문서 관리",
      CHAT_ADMIN: "채팅 관리",
      VOTE_ADMIN: "투표 관리",
      SIMULATION_ADMIN: "시뮬레이션 실행·관리",
    }[permission] ?? permission
  );
}

export function accessLabels(roles?: string[], permissions?: string[]): string {
  const labels = [...(roles ?? []).map(roleLabel), ...(permissions ?? []).map(permissionLabel)];
  return labels.join(", ") || "—";
}

export function auditEventLabel(eventType: string): string {
  return (
    {
      ACCOUNT_DEACTIVATED: "계정 비활성화",
      ADMIN_ROLES_REPLACED: "관리자 역할 변경",
      ROLE_CHANGED: "관리자 역할 변경",
    }[eventType] ?? "관리 이벤트"
  );
}

export function formatAdminDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat("ko-KR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "Asia/Seoul",
      }).format(date);
}
