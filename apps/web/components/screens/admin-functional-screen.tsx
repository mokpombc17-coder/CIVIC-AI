"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Route } from "next";
import Link from "next/link";
import { WireflowActionCard } from "@/components/wireflow/wireflow-blocks";
import type { ScreenDefinition } from "@/lib/screens/registry";
import { adminUserLabel, requestAdminUserLabels } from "@/lib/admin/user-labels";
import { mainScreenPrimaryActions } from "./main-screen-actions";
import { ScreenFrame } from "./screen-frame";
import type { ShellSession } from "@/lib/auth/shell-access";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";

type AdminUser = {
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
type AuditEvent = {
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
type UserStatusFilter = "all" | "active" | "inactive" | "admin";
export type AdminLoadMessages = Readonly<{ user: string; audit: string }>;
type RagJobCounts = Readonly<Record<string, number>>;
type RecentRagFailure = Readonly<{
  filename: string;
  failureCode: string;
  updatedAt?: string;
}>;
export type RagJobSummaryState =
  | { status: "loading" }
  | {
      status: "ready";
      failed: number;
      active: number;
      counts: RagJobCounts;
      recentFailures: readonly RecentRagFailure[];
    }
  | { status: "unavailable" };
export type AdminDomainMetricState =
  | { status: "loading" }
  | { status: "ready"; count: number; hasMore: boolean }
  | { status: "unavailable" }
  | { status: "forbidden" };

export function AdminFunctionalScreen({
  screen,
  adminSession = { role: "PARTICIPANT", permissions: [] },
}: Readonly<{
  screen: ScreenDefinition;
  adminSession?: Pick<ShellSession, "role" | "permissions">;
}>) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [audits, setAudits] = useState<AuditEvent[]>([]);
  const [auditUserLabels, setAuditUserLabels] = useState<Map<string, string>>(new Map());
  const [ragJobSummary, setRagJobSummary] = useState<RagJobSummaryState>({ status: "loading" });
  const [chatRequestSummary, setChatRequestSummary] = useState<AdminDomainMetricState>({
    status: adminSession.permissions.includes("CHAT_ADMIN") ? "loading" : "forbidden",
  });
  const [taskDeadlineSummary, setTaskDeadlineSummary] = useState<AdminDomainMetricState>({
    status: adminSession.permissions.includes("VOTE_ADMIN") ? "loading" : "forbidden",
  });
  const [message, setMessage] = useState("");
  const [auditMessage, setAuditMessage] = useState("");
  const [userStatusFilter, setUserStatusFilter] = useState<UserStatusFilter>("all");
  const [roleMutationPending, setRoleMutationPending] = useState(false);
  const roleMutationLock = useRef(createMutationLock());
  const userLoadGate = useRef(createLatestAdminUserRequestGate());
  const canReadRag = adminSession.permissions.includes("RAG_ADMIN");
  const canManageChat = adminSession.permissions.includes("CHAT_ADMIN");
  const canManageVote = adminSession.permissions.includes("VOTE_ADMIN");

  useEffect(() => {
    const activeUserLoadGate = userLoadGate.current;
    if (screen.id === "A-HOME-001" || screen.id.startsWith("A-USER")) void loadUsers();
    if (screen.id === "A-USER-005") void loadAudit();
    if (screen.id === "A-HOME-001" && canReadRag) {
      void refreshRagJobSummary();
    }
    if (screen.id === "A-HOME-001" && canManageChat) void refreshChatRequestSummary();
    if (screen.id === "A-HOME-001" && canManageVote) void refreshTaskDeadlineSummary();
    return () => activeUserLoadGate.cancel();
  }, [canManageChat, canManageVote, canReadRag, screen.id]);

  async function loadUsers(query = "") {
    const isCurrent = userLoadGate.current.begin();
    const items = await requestAdminUsers(query);
    if (!isCurrent()) return;
    if (items === null) {
      setUsers([]);
      setSelected(null);
      return setMessage("사용자 목록을 불러오지 못했습니다.");
    }
    setUsers(items);
    setMessage("");
    const requested =
      typeof window === "undefined"
        ? null
        : new URLSearchParams(window.location.search).get("userId");
    if (requested) {
      const requestedUser = await loadRequestedAdminUser(requested);
      if (!isCurrent()) return;
      if (!requestedUser) {
        setSelected(null);
        return setMessage("요청한 사용자를 불러오지 못했습니다.");
      }
      setSelected(requestedUser);
      return;
    }
    setSelected(items[0] ?? null);
  }

  async function loadAudit() {
    const requested =
      typeof window === "undefined"
        ? undefined
        : new URLSearchParams(window.location.search).get("userId") || undefined;
    const items = await requestAdminAudit(requested);
    if (items === null) {
      setAudits([]);
      setAuditMessage("감사 이력을 불러오지 못했습니다. 다시 시도해 주세요.");
      return;
    }
    setAudits(items);
    const labels = await requestAdminUserLabels(
      items.flatMap((event) => [event.actor_id, event.subject_id].filter(Boolean) as string[]),
    );
    setAuditUserLabels(labels ?? new Map());
    setAuditMessage("");
  }

  async function refreshRagJobSummary() {
    setRagJobSummary(await loadRagJobSummary());
  }

  async function refreshChatRequestSummary() {
    setChatRequestSummary(await loadChatRequestSummary());
  }

  async function refreshTaskDeadlineSummary() {
    setTaskDeadlineSummary(await loadTaskDeadlineSummary());
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadUsers(String(new FormData(event.currentTarget).get("query") ?? ""));
  }

  async function saveRoles(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const data = new FormData(event.currentTarget);
    const roles = data.getAll("roles").map(String);
    const permissions = data.getAll("permissions").map(String);
    const reason = String(data.get("reason") ?? "").trim();
    if (!reason) return setMessage("권한 변경 사유를 입력해 주세요.");
    if (screen.id === "A-USER-004" && data.get("impact_confirmed") !== "yes") {
      return setMessage("권한 회수 영향을 확인해 주세요.");
    }
    if (!roleMutationLock.current.tryBegin()) return;
    setRoleMutationPending(true);
    try {
      const response = await authenticatedFetch(adminRoleMutationPath(selected.user_id), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roles,
          permissions,
          row_version: selected.row_version,
          reason,
          impact_confirmed: screen.id === "A-USER-004",
        }),
      });
      if (!response.ok) {
        const problem = (await response.json().catch(() => ({}))) as { detail?: string };
        const latest = await loadRoleConflictUser(response.status, selected.user_id);
        if (latest) {
          setUsers((current) =>
            current.map((user) => (user.user_id === latest.user_id ? latest : user)),
          );
          setSelected(latest);
          return setMessage(
            problem.detail ?? "다른 관리자가 변경한 최신 권한 상태를 불러왔습니다.",
          );
        }
        return setMessage(
          problem.detail ?? "권한 변경을 저장하지 못했습니다. 최신 상태를 다시 확인해 주세요.",
        );
      }
      setSelected((await response.json()) as AdminUser);
      setMessage("권한 변경과 감사 이벤트를 저장했습니다.");
    } catch {
      setMessage("네트워크 오류로 권한 변경을 저장하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      roleMutationLock.current.end();
      setRoleMutationPending(false);
    }
  }

  const action = mainScreenPrimaryActions[screen.id] ?? "계속";

  return (
    <ScreenFrame
      {...(screen.id === "A-USER-005"
        ? { backHref: userBackHref("/admin/users/detail", selected) }
        : {})}
      screen={screen}
    >
      {screen.id === "A-HOME-001" ? (
        <AdminHome
          adminSession={adminSession}
          chatRequestSummary={chatRequestSummary}
          ragJobSummary={ragJobSummary}
          taskDeadlineSummary={taskDeadlineSummary}
        />
      ) : null}
      {screen.id.startsWith("A-USER") ? (
        <div className="civic-admin-workbench" data-wireflow-layout={adminUserLayout(screen.id)}>
          {screen.id === "A-USER-001" ? (
            <form className="civic-admin-search" onSubmit={search}>
              <label>
                <span>이메일 또는 채팅 이름 검색</span>
                <input name="query" placeholder="검색어 입력…" type="search" />
              </label>
              <button type="submit">검색</button>
              <div aria-label="사용자 상태 필터" className="wf-admin-filters" role="group">
                {[
                  ["all", "전체"],
                  ["active", "활성"],
                  ["inactive", "비활성"],
                  ["admin", "관리자"],
                ].map(([value, label]) => (
                  <button
                    aria-pressed={userStatusFilter === value}
                    key={value}
                    onClick={() => setUserStatusFilter(value as UserStatusFilter)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </form>
          ) : null}
          {screen.id === "A-USER-001" ? (
            <>
              <UserTable onSelect={setSelected} users={filterAdminUsers(users, userStatusFilter)} />
              <Link className="wf-button wf-button-secondary wf-admin-workbench-link" href="/admin">
                관리 업무
              </Link>
            </>
          ) : (
            <section className="civic-user-detail">
              <UserTabs activeId={screen.id} selected={selected} />
              <UserSummary selected={selected} />
              {screen.id === "A-USER-002" ? (
                <>
                  <div className="civic-detail-actions">
                    <Link href={userRoute("/admin/users/roles", selected)}>관리자·권한 편집</Link>
                  </div>
                  <UserTimeline selected={selected} />
                  <Link
                    className="wf-button wf-button-secondary wf-admin-history-link"
                    href={userRoute("/admin/users/audit", selected)}
                  >
                    권한 변경 이력
                  </Link>
                </>
              ) : null}
              {screen.id === "A-USER-003" ? (
                <RoleForm
                  action={action}
                  key={roleFormKey(selected, screen.id)}
                  onSubmit={saveRoles}
                  pending={roleMutationPending}
                  selected={selected}
                />
              ) : null}
              {screen.id === "A-USER-004" ? (
                <RoleForm
                  action={action}
                  confirmation
                  key={roleFormKey(selected, screen.id)}
                  onSubmit={saveRoles}
                  pending={roleMutationPending}
                  selected={selected}
                />
              ) : null}
              {screen.id === "A-USER-005" ? (
                <AuditList events={audits} userLabels={auditUserLabels} />
              ) : null}
            </section>
          )}
          {[message, auditMessage].filter(Boolean).map((currentMessage) => (
            <p aria-live="polite" className="civic-form-message" key={currentMessage} role="status">
              {currentMessage}
            </p>
          ))}
          <span className="civic-screen-action-label">{action}</span>
        </div>
      ) : null}
    </ScreenFrame>
  );
}

export function filterAdminUsers(users: AdminUser[], filter: UserStatusFilter) {
  if (filter === "active") return users.filter((user) => user.account_state === "ACTIVE");
  if (filter === "inactive") return users.filter((user) => user.account_state !== "ACTIVE");
  if (filter === "admin") {
    return users.filter((user) =>
      user.roles.some((role) => ["ADMIN", "HIGHEST_ADMIN"].includes(role)),
    );
  }
  return users;
}

function AdminHome({
  ragJobSummary,
  adminSession,
  chatRequestSummary,
  taskDeadlineSummary,
}: {
  ragJobSummary: RagJobSummaryState;
  chatRequestSummary: AdminDomainMetricState;
  taskDeadlineSummary: AdminDomainMetricState;
  adminSession: Pick<ShellSession, "role" | "permissions">;
}) {
  const can = (permission: ShellSession["permissions"][number]) =>
    adminSession.permissions.includes(permission);
  return (
    <div className="civic-admin-home" data-wireflow-layout="admin-home">
      <ul aria-label="관리 현황" className="civic-admin-metrics">
        <li className="wf-admin-metric">
          <small>승인 대기</small>
          <strong>{metricCount(chatRequestSummary)}</strong>
          <span>{metricDescription(chatRequestSummary, "채팅 생성 신청")}</span>
        </li>
        <li className="wf-admin-metric">
          <small>처리 실패</small>
          <strong>
            {ragJobSummary.status === "ready"
              ? `${ragJobSummary.failed}건`
              : ragJobSummary.status === "unavailable"
                ? "확인 불가"
                : "확인 중"}
          </strong>
          <span>
            {ragJobSummary.status === "unavailable"
              ? "RAG 운영 지표를 불러오지 못했습니다"
              : ragJobSummary.status === "ready"
                ? `진행 중 ${ragJobSummary.active}건 · 실패 작업 재시도 가능`
                : "문서 처리 상태 확인 중"}
          </span>
        </li>
        <li className="wf-admin-metric">
          <small>24시간 내 마감</small>
          <strong>{metricCount(taskDeadlineSummary)}</strong>
          <span>{metricDescription(taskDeadlineSummary, "진행 중 과업")}</span>
        </li>
      </ul>
      {ragJobSummary.status === "ready" && ragJobSummary.recentFailures.length > 0 ? (
        <section aria-label="최근 문서 처리 실패" className="civic-rag-failure-summary">
          <header>
            <h2>확인이 필요한 문서</h2>
            <Link href="/admin/rag">문서 관리에서 조치</Link>
          </header>
          <ul>
            {ragJobSummary.recentFailures.map((failure) => (
              <li key={`${failure.filename}:${failure.updatedAt ?? failure.failureCode}`}>
                <strong>{failure.filename}</strong>
                <span>{ragFailureLabel(failure.failureCode)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section aria-label="관리 업무" className="civic-admin-cards">
        {adminSession.role === "HIGHEST_ADMIN" ? (
          <WireflowActionCard
            action={<AdminCardLink href="/admin/users">사용자 관리 열기</AdminCardLink>}
            badge="계정"
            description="관리자 역할과 변경 이력"
            title="사용자·권한"
          />
        ) : null}
        {can("RAG_ADMIN") ? (
          <WireflowActionCard
            action={<AdminCardLink href="/admin/rag">문서 관리 열기</AdminCardLink>}
            badge="문서"
            description="폴더·업로드·처리 상태"
            title="문서 관리"
          />
        ) : null}
        {can("CHAT_ADMIN") ? (
          <WireflowActionCard
            action={<AdminCardLink href="/admin/chat/requests">채팅 신청 열기</AdminCardLink>}
            badge="채팅"
            description="생성 신청 검토·승인·반려"
            title="채팅 신청"
          />
        ) : null}
        {can("VOTE_ADMIN") ? (
          <WireflowActionCard
            action={<AdminCardLink href="/admin/tasks">과업 관리 열기</AdminCardLink>}
            badge="과업"
            description="생성·마감·결과"
            title="과업 관리"
          />
        ) : null}
        {can("SIMULATION_ADMIN") ? (
          <WireflowActionCard
            action={<AdminCardLink href="/admin/simulations">시뮬레이션 열기</AdminCardLink>}
            badge="실험"
            description="실행·상태·결과"
            title="시뮬레이션"
          />
        ) : null}
      </section>
    </div>
  );
}

export function readFailedRagJobs(value: unknown): number | null {
  if (!value || typeof value !== "object" || !("failed" in value)) return null;
  const failed = value.failed;
  return typeof failed === "number" && Number.isSafeInteger(failed) && failed >= 0 ? failed : null;
}

export function readRagJobSummary(
  value: unknown,
): Extract<RagJobSummaryState, { status: "ready" }> | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const failed = readFailedRagJobs(value);
  if (
    failed === null ||
    typeof record.active !== "number" ||
    !Number.isSafeInteger(record.active) ||
    record.active < 0 ||
    !record.counts ||
    typeof record.counts !== "object" ||
    !Array.isArray(record.recent_failures)
  ) {
    return null;
  }
  const counts = Object.fromEntries(
    Object.entries(record.counts as Record<string, unknown>).flatMap(([key, count]) =>
      typeof count === "number" && Number.isSafeInteger(count) && count >= 0 ? [[key, count]] : [],
    ),
  );
  const recentFailures = record.recent_failures.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const failure = item as Record<string, unknown>;
    if (typeof failure.filename !== "string" || typeof failure.failure_code !== "string") return [];
    return [
      {
        filename: failure.filename,
        failureCode: failure.failure_code,
        ...(typeof failure.updated_at === "string" ? { updatedAt: failure.updated_at } : {}),
      },
    ];
  });
  return { status: "ready", failed, active: record.active, counts, recentFailures };
}

function ragFailureLabel(code: string): string {
  return (
    {
      PROCESSING_FAILED: "변환 또는 색인에 실패했습니다.",
      OBJECT_CLEANUP_FAILED: "임시 파일 정리가 필요합니다.",
      DOCUMENT_DELETED: "삭제된 문서의 작업입니다.",
    }[code] ?? "처리 상태를 확인하고 다시 시도하세요."
  );
}

export async function loadRagJobSummary(
  request: typeof fetch = authenticatedFetch,
): Promise<RagJobSummaryState> {
  try {
    const response = await request("/api/v1/rag/jobs/summary", { cache: "no-store" });
    if (!response.ok) return { status: "unavailable" };
    return readRagJobSummary(await response.json()) ?? { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

export async function loadChatRequestSummary(
  request: typeof fetch = authenticatedFetch,
): Promise<AdminDomainMetricState> {
  try {
    const response = await request(
      "/api/v1/admin/room-creation-requests?status=PENDING&limit=100",
      { cache: "no-store" },
    );
    if (!response.ok) return { status: "unavailable" };
    const value = (await response.json()) as { items?: unknown; hasNext?: unknown };
    if (!Array.isArray(value.items) || typeof value.hasNext !== "boolean") {
      return { status: "unavailable" };
    }
    return { status: "ready", count: value.items.length, hasMore: value.hasNext };
  } catch {
    return { status: "unavailable" };
  }
}

export async function loadTaskDeadlineSummary(
  request: typeof fetch = authenticatedFetch,
  now = Date.now(),
): Promise<AdminDomainMetricState> {
  try {
    const response = await request("/api/v1/admin/tasks", { cache: "no-store" });
    if (!response.ok) return { status: "unavailable" };
    const value = await response.json();
    if (!Array.isArray(value)) return { status: "unavailable" };
    const deadline = now + 24 * 60 * 60 * 1_000;
    const count = value.filter((item) => {
      if (!item || typeof item !== "object") return false;
      const record = item as Record<string, unknown>;
      if (record.status !== "OPEN" || !record.schedule || typeof record.schedule !== "object") {
        return false;
      }
      const closesAt = (record.schedule as Record<string, unknown>).closesAt;
      if (typeof closesAt !== "string") return false;
      const timestamp = Date.parse(closesAt);
      return Number.isFinite(timestamp) && timestamp > now && timestamp <= deadline;
    }).length;
    return { status: "ready", count, hasMore: false };
  } catch {
    return { status: "unavailable" };
  }
}

function metricCount(summary: AdminDomainMetricState): string {
  if (summary.status === "ready") return `${summary.count}건${summary.hasMore ? " 이상" : ""}`;
  if (summary.status === "forbidden") return "권한 없음";
  return summary.status === "loading" ? "확인 중" : "확인 불가";
}

function metricDescription(summary: AdminDomainMetricState, label: string): string {
  if (summary.status === "ready") return label;
  if (summary.status === "forbidden") return "담당 관리자 권한이 필요합니다";
  return summary.status === "loading" ? `${label} 확인 중` : `${label}을 불러오지 못했습니다`;
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

export async function requestAdminUsers(
  query: string,
  request: typeof fetch = authenticatedFetch,
): Promise<AdminUser[] | null> {
  try {
    const response = await request(`/api/v1/admin/users?query=${encodeURIComponent(query)}`, {
      cache: "no-store",
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { items?: unknown };
    return Array.isArray(data.items) ? (data.items as AdminUser[]) : null;
  } catch {
    return null;
  }
}

export async function requestAdminAudit(
  subjectId: string | undefined,
  request: typeof fetch = authenticatedFetch,
): Promise<AuditEvent[] | null> {
  try {
    const response = await request("/api/v1/admin/audit", { cache: "no-store" });
    if (!response.ok) return null;
    const data = (await response.json()) as { items?: unknown };
    if (!Array.isArray(data.items)) return null;
    const items = data.items as AuditEvent[];
    return subjectId ? items.filter((event) => event.subject_id === subjectId) : items;
  } catch {
    return null;
  }
}

export function updateAdminLoadMessage(
  current: AdminLoadMessages,
  channel: keyof AdminLoadMessages,
  message: string,
): AdminLoadMessages {
  return { ...current, [channel]: message };
}

function AdminCardLink({ children, href }: Readonly<{ children: string; href: string }>) {
  return (
    <Link className="wf-button wf-button-secondary" href={href as Route}>
      {children}
    </Link>
  );
}
function RoleForm({
  selected,
  onSubmit,
  action,
  confirmation = false,
  pending,
}: {
  selected: AdminUser | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  action: string;
  confirmation?: boolean;
  pending: boolean;
}) {
  const [selectedRoles, setSelectedRoles] = useState<string[]>(selected?.roles ?? []);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>(
    selected?.permissions ?? [],
  );

  const form = (
    <form
      aria-labelledby={confirmation ? "role-revoke-title" : undefined}
      className={`civic-role-form${confirmation ? " civic-role-dialog" : ""}`}
      onSubmit={onSubmit}
      role={confirmation ? "alertdialog" : undefined}
      aria-modal={confirmation ? "true" : undefined}
    >
      {confirmation ? (
        <header>
          <span>확인</span>
          <h2 id="role-revoke-title">권한을 회수하시겠습니까?</h2>
          <p>문서와 감사 이력은 삭제되지 않으며 저장 시 최신 권한 version을 다시 확인합니다.</p>
        </header>
      ) : null}
      {!confirmation ? (
        <dl className="wf-role-target">
          <div>
            <dt>대상 계정</dt>
            <dd>{selected?.email ?? "사용자 확인 중"}</dd>
          </div>
          <div>
            <dt>현재 역할</dt>
            <dd>{selected?.roles.map(roleLabel).join(", ") || "없음"}</dd>
          </div>
          <div>
            <dt>현재 운영 권한</dt>
            <dd>{selected?.permissions.map(permissionLabel).join(", ") || "없음"}</dd>
          </div>
        </dl>
      ) : null}
      <fieldset>
        <legend>{confirmation ? "회수 후 유지할 역할" : "관리자 역할"}</legend>
        {["PARTICIPANT", "ADMIN", "HIGHEST_ADMIN"].map((role) => (
          <label key={role}>
            <input
              checked={selectedRoles.includes(role)}
              disabled={!selected || pending}
              name="roles"
              onChange={(event) => {
                const checked = event.currentTarget.checked;
                setSelectedRoles((current) =>
                  checked
                    ? [...new Set([...current, role])]
                    : current.filter((item) => item !== role),
                );
                if (!checked && (role === "ADMIN" || role === "HIGHEST_ADMIN")) {
                  const remainingAdministratorRole = selectedRoles.some(
                    (item) => item !== role && (item === "ADMIN" || item === "HIGHEST_ADMIN"),
                  );
                  if (!remainingAdministratorRole) setSelectedPermissions([]);
                }
              }}
              type="checkbox"
              value={role}
            />
            <span>{roleLabel(role)}</span>
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>{confirmation ? "회수 후 유지할 운영 권한" : "운영 권한"}</legend>
        {["RAG_ADMIN", "CHAT_ADMIN", "VOTE_ADMIN", "SIMULATION_ADMIN"].map((permission) => (
          <label key={permission}>
            <input
              checked={selectedPermissions.includes(permission)}
              disabled={!selected || pending}
              name="permissions"
              onChange={(event) => {
                const checked = event.currentTarget.checked;
                setSelectedPermissions((current) =>
                  checked
                    ? [...new Set([...current, permission])]
                    : current.filter((item) => item !== permission),
                );
                if (
                  checked &&
                  !selectedRoles.some((role) => role === "ADMIN" || role === "HIGHEST_ADMIN")
                ) {
                  setSelectedRoles((current) => [...new Set([...current, "ADMIN"])]);
                }
              }}
              type="checkbox"
              value={permission}
            />
            <span>{permissionLabel(permission)}</span>
          </label>
        ))}
      </fieldset>
      <label className="civic-field">
        <span>변경 사유 (필수)</span>
        <textarea
          disabled={!selected || pending}
          maxLength={1000}
          name="reason"
          required
          rows={4}
        />
      </label>
      {confirmation ? (
        <label className="civic-check">
          <input disabled={pending} name="impact_confirmed" required type="checkbox" value="yes" />
          <span>영향을 확인했습니다</span>
        </label>
      ) : null}
      <div className="civic-form-actions">
        {confirmation ? (
          <Link href={userRoute("/admin/users/roles", selected)}>편집으로</Link>
        ) : (
          <Link href={userRoute("/admin/users/roles/revoke", selected)}>권한 회수 영향 확인</Link>
        )}
        <button
          className={confirmation ? "civic-danger-action" : "civic-primary-action"}
          disabled={!selected || pending}
          type="submit"
        >
          {action}
        </button>
      </div>
    </form>
  );
  if (!confirmation) return form;
  return (
    <div className="wf-admin-overlay">
      <div aria-hidden="true" className="wf-admin-scrim" />
      {form}
    </div>
  );
}
export function AuditList({
  events,
  userLabels = new Map(),
}: {
  events: AuditEvent[];
  userLabels?: ReadonlyMap<string, string>;
}) {
  return (
    <div aria-label="감사 이력 표" className="civic-table-scroll" role="region" tabIndex={0}>
      <table className="civic-admin-table">
        <thead>
          <tr>
            <th>이벤트</th>
            <th>실행자</th>
            <th>대상</th>
            <th>변경 전</th>
            <th>변경 후</th>
            <th>사유</th>
            <th>변경 시각</th>
            <th>작업</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => {
            const subjectHref = auditSubjectHref(event.subject_id);
            return (
              <tr key={event.event_id}>
                <td>{auditEventLabel(event.event_type)}</td>
                <td>{adminUserLabel(userLabels, event.actor_id)}</td>
                <td>{adminUserLabel(userLabels, event.subject_id)}</td>
                <td>{accessLabels(event.before_roles, event.before_permissions)}</td>
                <td>{accessLabels(event.after_roles, event.after_permissions)}</td>
                <td>{event.reason ?? "—"}</td>
                <td>{formatDate(event.occurred_at)}</td>
                <td>
                  {subjectHref ? (
                    <Link className="civic-primary-action" href={subjectHref as Route}>
                      대상 사용자 보기
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function auditEventLabel(eventType: string): string {
  return (
    {
      ACCOUNT_DEACTIVATED: "계정 비활성화",
      ADMIN_ROLES_REPLACED: "관리자 역할 변경",
      ROLE_CHANGED: "관리자 역할 변경",
    }[eventType] ?? "관리 이벤트"
  );
}

export function auditSubjectHref(subjectId: string | null | undefined): string | null {
  return subjectId ? `/admin/users/detail?userId=${encodeURIComponent(subjectId)}` : null;
}

function UserTable({
  users,
  onSelect,
}: {
  users: AdminUser[];
  onSelect: (user: AdminUser) => void;
}) {
  return (
    <div aria-label="사용자 목록 표" className="civic-table-scroll" role="region" tabIndex={0}>
      <table className="civic-admin-table">
        <thead>
          <tr>
            <th>이메일</th>
            <th>계정 상태</th>
            <th>관리자 역할</th>
            <th>운영 권한</th>
            <th>최근 활동</th>
            <th>작업</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.user_id}>
              <td>{user.email}</td>
              <td>{accountStateLabel(user.account_state)}</td>
              <td>
                {user.roles
                  .filter((role) => role !== "PARTICIPANT")
                  .map(roleLabel)
                  .join(", ") || "없음"}
              </td>
              <td>{user.permissions.map(permissionLabel).join(", ") || "없음"}</td>
              <td>{formatDate(user.last_activity_at)}</td>
              <td>
                <Link
                  className="civic-primary-action"
                  href={userRoute("/admin/users/detail", user)}
                  onClick={() => onSelect(user)}
                >
                  사용자 상세
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UserTabs({ activeId, selected }: { activeId: string; selected: AdminUser | null }) {
  return (
    <nav aria-label="사용자 상세 메뉴" className="civic-detail-tabs">
      <Link
        aria-current={activeId === "A-USER-002" || activeId === "A-USER-004" ? "page" : undefined}
        href={userRoute("/admin/users/detail", selected)}
      >
        사용자·관리자 상세
      </Link>
      <Link
        aria-current={activeId === "A-USER-003" ? "page" : undefined}
        href={userRoute("/admin/users/roles", selected)}
      >
        관리자 전환·권한 편집
      </Link>
      <Link
        aria-current={activeId === "A-USER-005" ? "page" : undefined}
        href={userRoute("/admin/users/audit", selected)}
      >
        권한 변경 이력
      </Link>
    </nav>
  );
}

function UserTimeline({ selected }: { selected: AdminUser | null }) {
  return (
    <ol aria-label="사용자 권한 요약" className="wf-admin-timeline">
      <li>
        <span aria-hidden="true" />
        <strong>
          {selected?.roles.includes("HIGHEST_ADMIN") ? "최고 관리자 지정" : "관리자 상태"}
        </strong>
        <small>{formatDate(selected?.last_activity_at)}</small>
      </li>
      <li>
        <span aria-hidden="true" />
        <strong>권한 변경 이력</strong>
        <small>변경 사유와 역할 기록을 보관합니다.</small>
      </li>
    </ol>
  );
}

function adminUserLayout(id: string): string {
  if (id === "A-USER-001") return "admin-user-list";
  if (id === "A-USER-003") return "admin-role-editor";
  if (id === "A-USER-004") return "admin-role-revoke";
  if (id === "A-USER-005") return "admin-role-audit";
  return "admin-user-detail";
}

function UserSummary({ selected }: { selected: AdminUser | null }) {
  return (
    <div className="civic-user-summary-grid">
      <div>
        <span>이메일</span>
        <strong>{selected?.email ?? "사용자를 선택하세요"}</strong>
      </div>
      <div>
        <span>이메일 인증</span>
        <strong>{selected?.email_verified_at ? "인증 완료" : "확인 필요"}</strong>
      </div>
      <div>
        <span>계정 상태</span>
        <strong>{selected ? accountStateLabel(selected.account_state) : "—"}</strong>
      </div>
      <div>
        <span>관리자 역할</span>
        <strong>{selected?.roles.map(roleLabel).join(", ") || "없음"}</strong>
      </div>
      <div>
        <span>운영 권한</span>
        <strong>{selected?.permissions.map(permissionLabel).join(", ") || "없음"}</strong>
      </div>
    </div>
  );
}

export function userRoute(
  path: string,
  selected: AdminUser | null,
): { pathname: string; query?: { userId: string } } {
  return selected ? { pathname: path, query: { userId: selected.user_id } } : { pathname: path };
}

export function userBackHref(path: string, selected: AdminUser | null): Route {
  return (selected ? `${path}?userId=${encodeURIComponent(selected.user_id)}` : path) as Route;
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

function accountStateLabel(state: string): string {
  return (
    {
      ACTIVE: "활성",
      INACTIVE: "비활성",
      DELETED: "삭제됨",
      PENDING_EMAIL_VERIFICATION: "이메일 인증 대기",
    }[state] ?? state
  );
}

function roleLabel(role: string): string {
  return (
    {
      PARTICIPANT: "참여자",
      ADMIN: "운영 관리자",
      HIGHEST_ADMIN: "최고 관리자",
    }[role] ?? role
  );
}

function permissionLabel(permission: string): string {
  return (
    {
      RAG_ADMIN: "RAG 관리",
      CHAT_ADMIN: "채팅 관리",
      VOTE_ADMIN: "과업·투표 관리",
      SIMULATION_ADMIN: "시뮬레이션 실행·관리",
    }[permission] ?? permission
  );
}

function accessLabels(roles?: string[], permissions?: string[]): string {
  const labels = [...(roles ?? []).map(roleLabel), ...(permissions ?? []).map(permissionLabel)];
  return labels.join(", ") || "—";
}

function formatDate(value?: string | null): string {
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
