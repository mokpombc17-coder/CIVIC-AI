"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Route } from "next";
import Link from "next/link";
import { AdminCurrentOperations } from "@/components/admin/admin-current-operations";
import type { ScreenDefinition } from "@/lib/screens/registry";
import { adminUserLabel, requestAdminUserLabels } from "@/lib/admin/user-labels";
import { readWalletSummary, type WalletSummary } from "@/lib/admin/simulation-billing-contracts";
import { mainScreenPrimaryActions } from "./main-screen-actions";
import { ScreenFrame } from "./screen-frame";
import type { CurrentUser } from "@/lib/auth/shell-access";
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
export type AdminRoleChoice = "PARTICIPANT" | "ADMIN" | "HIGHEST_ADMIN";
export const ADMIN_PERMISSION_CODES = [
  "RAG_ADMIN",
  "CHAT_ADMIN",
  "VOTE_ADMIN",
  "SIMULATION_ADMIN",
] as const;
const ADMIN_ROLE_CHOICES: ReadonlyArray<
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
export type AdminLoadMessages = Readonly<{ user: string; audit: string }>;
type RagJobCounts = Readonly<Record<string, number>>;
export type RecentRagFailure = Readonly<{
  jobId: string;
  documentId: string;
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
export type SimulationWalletMetricState =
  | { status: "loading" }
  | { status: "ready"; wallet: WalletSummary }
  | { status: "unavailable" }
  | { status: "forbidden" };

export function AdminFunctionalScreen({
  screen,
  adminCurrentUser = { role: "PARTICIPANT", permissions: [] },
}: Readonly<{
  screen: ScreenDefinition;
  adminCurrentUser?: Pick<CurrentUser, "role" | "permissions">;
}>) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [audits, setAudits] = useState<AuditEvent[]>([]);
  const [auditUserLabels, setAuditUserLabels] = useState<Map<string, string>>(new Map());
  const [ragJobSummary, setRagJobSummary] = useState<RagJobSummaryState>({ status: "loading" });
  const [chatRequestSummary, setChatRequestSummary] = useState<AdminDomainMetricState>({
    status: adminCurrentUser.permissions.includes("CHAT_ADMIN") ? "loading" : "forbidden",
  });
  const [taskDeadlineSummary, setTaskDeadlineSummary] = useState<AdminDomainMetricState>({
    status: adminCurrentUser.permissions.includes("VOTE_ADMIN") ? "loading" : "forbidden",
  });
  const [simulationWalletSummary, setSimulationWalletSummary] =
    useState<SimulationWalletMetricState>({
      status: adminCurrentUser.permissions.includes("SIMULATION_ADMIN") ? "loading" : "forbidden",
    });
  const [message, setMessage] = useState("");
  const [auditMessage, setAuditMessage] = useState("");
  const [userStatusFilter, setUserStatusFilter] = useState<UserStatusFilter>("all");
  const [roleMutationPending, setRoleMutationPending] = useState(false);
  const roleMutationLock = useRef(createMutationLock());
  const userLoadGate = useRef(createLatestAdminUserRequestGate());
  const canReadRag = adminCurrentUser.permissions.includes("RAG_ADMIN");
  const canManageChat = adminCurrentUser.permissions.includes("CHAT_ADMIN");
  const canManageVote = adminCurrentUser.permissions.includes("VOTE_ADMIN");
  const canManageSimulation = adminCurrentUser.permissions.includes("SIMULATION_ADMIN");

  useEffect(() => {
    const activeUserLoadGate = userLoadGate.current;
    if (screen.id.startsWith("A-USER")) void loadUsers();
    if (screen.id === "A-USER-005") void loadAudit();
    if (screen.id === "A-HOME-001" && canReadRag) {
      void refreshRagJobSummary();
    }
    if (screen.id === "A-HOME-001" && canManageChat) void refreshChatRequestSummary();
    if (screen.id === "A-HOME-001" && canManageVote) void refreshTaskDeadlineSummary();
    if (screen.id === "A-HOME-001" && canManageSimulation) {
      void refreshSimulationWalletSummary();
    }
    return () => activeUserLoadGate.cancel();
  }, [canManageChat, canManageSimulation, canManageVote, canReadRag, screen.id]);

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

  async function refreshSimulationWalletSummary() {
    setSimulationWalletSummary(await loadSimulationWalletSummary());
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadUsers(String(new FormData(event.currentTarget).get("query") ?? ""));
  }

  async function saveRoles(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const data = new FormData(event.currentTarget);
    const role = data.get("roles");
    if (!isAdminRoleChoice(role)) return setMessage("변경할 역할을 선택해 주세요.");
    const roles = [role];
    const permissions = permissionsForAdminRole(role, data.getAll("permissions").map(String));
    const reason = String(data.get("reason") ?? "").trim();
    if (!reason) return setMessage("권한 변경 사유를 입력해 주세요.");
    const impactConfirmed = hasAdminAccessRevocation(
      selected.roles,
      selected.permissions,
      roles,
      permissions,
    );
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
          impact_confirmed: impactConfirmed,
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
          canManageSimulation={canManageSimulation}
          canReadRag={canReadRag}
          chatRequestSummary={chatRequestSummary}
          ragJobSummary={ragJobSummary}
          simulationWalletSummary={simulationWalletSummary}
          taskDeadlineSummary={taskDeadlineSummary}
        />
      ) : null}
      {screen.id.startsWith("A-USER") ? (
        <div className="civic-admin-workbench" data-wireflow-layout={adminUserLayout(screen.id)}>
          {screen.id === "A-USER-001" ? (
            <form className="civic-admin-search" onSubmit={search}>
              <label>
                <span>이메일 검색</span>
                <input name="query" placeholder="이메일 주소 입력…" type="search" />
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
            <UserTable onSelect={setSelected} users={filterAdminUsers(users, userStatusFilter)} />
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
              {screen.id === "A-USER-003" || screen.id === "A-USER-004" ? (
                <RoleForm
                  action={action}
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
  canManageSimulation,
  canReadRag,
  ragJobSummary,
  chatRequestSummary,
  simulationWalletSummary,
  taskDeadlineSummary,
}: {
  canManageSimulation: boolean;
  canReadRag: boolean;
  ragJobSummary: RagJobSummaryState;
  chatRequestSummary: AdminDomainMetricState;
  simulationWalletSummary: SimulationWalletMetricState;
  taskDeadlineSummary: AdminDomainMetricState;
}) {
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
        <li className="wf-admin-metric">
          <small>시뮬레이션 사용 잔액</small>
          <strong>{simulationWalletBalance(simulationWalletSummary)}</strong>
          <span>{simulationWalletDescription(simulationWalletSummary)}</span>
        </li>
      </ul>
      <AdminCurrentOperations canManageSimulation={canManageSimulation} canReadRag={canReadRag} />
      {ragJobSummary.status === "ready" && ragJobSummary.recentFailures.length > 0 ? (
        <RagFailureSummary failures={ragJobSummary.recentFailures} />
      ) : null}
    </div>
  );
}

export function RagFailureSummary({
  failures,
}: Readonly<{ failures: readonly RecentRagFailure[] }>) {
  return (
    <section aria-label="최근 문서 처리 실패" className="civic-rag-failure-summary">
      <header>
        <h2>확인이 필요한 문서</h2>
      </header>
      <ul>
        {failures.map((failure) => (
          <li key={failure.jobId}>
            <strong>{failure.filename}</strong>
            <span>{ragFailureLabel(failure.failureCode)}</span>
            <Link
              aria-label={`${failure.filename} 업로드 화면에서 재시도`}
              className="wf-button wf-button-secondary civic-rag-failure-retry"
              href={ragFailureRetryHref(failure)}
            >
              재시도
            </Link>
          </li>
        ))}
      </ul>
    </section>
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
    if (
      typeof failure.job_id !== "string" ||
      typeof failure.document_id !== "string" ||
      typeof failure.filename !== "string" ||
      typeof failure.failure_code !== "string"
    ) {
      return [];
    }
    return [
      {
        jobId: failure.job_id,
        documentId: failure.document_id,
        filename: failure.filename,
        failureCode: failure.failure_code,
        ...(typeof failure.updated_at === "string" ? { updatedAt: failure.updated_at } : {}),
      },
    ];
  });
  return { status: "ready", failed, active: record.active, counts, recentFailures };
}

export function ragFailureRetryHref(failure: RecentRagFailure): Route {
  const parameters = new URLSearchParams({
    retryJobId: failure.jobId,
    documentId: failure.documentId,
    filename: failure.filename,
  });
  return `/admin/rag/upload?${parameters.toString()}` as Route;
}

export function ragFailureLabel(code: string): string {
  return (
    {
      PROCESSING_FAILED: "변환 또는 색인에 실패했습니다.",
      DOCUMENT_READ_FAILED: "문서를 읽을 수 없습니다. 암호화 또는 손상 여부를 확인해 주세요.",
      PAGE_INDEX_OUTLINE_FAILED: "문서 구조 분석에 실패했습니다. 다시 시도해 주세요.",
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

export async function loadSimulationWalletSummary(
  request: typeof fetch = authenticatedFetch,
): Promise<SimulationWalletMetricState> {
  try {
    const response = await request("/api/v1/admin/simulation-billing/wallet", {
      cache: "no-store",
    });
    if (!response.ok) return { status: "unavailable" };
    const wallet = readWalletSummary(await response.json());
    return wallet ? { status: "ready", wallet } : { status: "unavailable" };
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

function simulationWalletBalance(summary: SimulationWalletMetricState): string {
  if (summary.status === "ready") return formatKrw(summary.wallet.availableKrw);
  if (summary.status === "forbidden") return "권한 없음";
  return summary.status === "loading" ? "확인 중" : "확인 불가";
}

function simulationWalletDescription(summary: SimulationWalletMetricState): string {
  if (summary.status === "ready") {
    return `전체 ${formatKrw(summary.wallet.balanceKrw)} · 실행 보류 ${formatKrw(summary.wallet.heldKrw)}`;
  }
  if (summary.status === "forbidden") return "시뮬레이션 관리자 권한이 필요합니다";
  return summary.status === "loading"
    ? "공용 지갑 잔액 확인 중"
    : "공용 지갑 잔액을 불러오지 못했습니다";
}

function formatKrw(value: number): string {
  return `${value.toLocaleString("ko-KR")}원`;
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

function RoleForm({
  selected,
  onSubmit,
  action,
  pending,
}: {
  selected: AdminUser | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  action: string;
  pending: boolean;
}) {
  const initialRole = selectedAdminRole(selected?.roles ?? []);
  const [selectedRole, setSelectedRole] = useState<AdminRoleChoice>(initialRole);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>(
    permissionsForAdminRole(initialRole, selected?.permissions ?? []),
  );
  const effectivePermissions = permissionsForAdminRole(selectedRole, selectedPermissions);
  const isHighestAdmin = selectedRole === "HIGHEST_ADMIN";
  const isParticipant = selectedRole === "PARTICIPANT";

  return (
    <form className="civic-role-form" onSubmit={onSubmit}>
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
      <fieldset className="wf-role-section">
        <legend>역할</legend>
        <p className="wf-role-section-help">역할은 하나만 선택할 수 있습니다.</p>
        <div className="wf-role-options">
          {ADMIN_ROLE_CHOICES.map((role) => (
            <label
              className={`wf-role-option${selectedRole === role.value ? " is-selected" : ""}`}
              key={role.value}
            >
              <input
                checked={selectedRole === role.value}
                disabled={!selected || pending}
                name="roles"
                onChange={() => {
                  setSelectedRole(role.value);
                  setSelectedPermissions((current) => permissionsForAdminRole(role.value, current));
                }}
                type="radio"
                value={role.value}
              />
              <span>
                <strong>{role.label}</strong>
                <small>{role.description}</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="wf-role-section" aria-describedby="operating-permission-help">
        <legend>운영 권한</legend>
        <p
          aria-live="polite"
          className={`wf-role-section-help${isParticipant ? " is-revocation" : ""}`}
          id="operating-permission-help"
        >
          {isHighestAdmin
            ? "최고 관리자는 모든 운영 권한을 가지며 개별 권한을 편집할 수 없습니다."
            : isParticipant
              ? "사용자로 저장하면 관리자 역할과 운영 권한이 모두 해제됩니다."
              : "담당할 관리 업무만 선택하세요."}
        </p>
        <div className="wf-permission-options">
          {ADMIN_PERMISSION_CODES.map((permission) => (
            <label
              className={`wf-permission-option${effectivePermissions.includes(permission) ? " is-selected" : ""}${isHighestAdmin || isParticipant ? " is-locked" : ""}`}
              key={permission}
            >
              <input
                checked={effectivePermissions.includes(permission)}
                disabled={!selected || pending || isHighestAdmin || isParticipant}
                name="permissions"
                onChange={(event) => {
                  const checked = event.currentTarget.checked;
                  setSelectedPermissions((current) =>
                    checked
                      ? [...new Set([...current, permission])]
                      : current.filter((item) => item !== permission),
                  );
                }}
                type="checkbox"
                value={permission}
              />
              <span>{permissionLabel(permission)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="civic-role-reason">
        <span className="wf-role-reason-heading">
          <strong>변경 사유</strong>
          <em>필수</em>
        </span>
        <small>감사 이력에서 변경 목적을 바로 이해할 수 있도록 간단히 적어 주세요.</small>
        <textarea
          aria-label="변경 사유 (필수)"
          disabled={!selected || pending}
          maxLength={1000}
          name="reason"
          placeholder="예: 문서 운영 담당자로 지정"
          required
          rows={2}
        />
      </label>
      <div className="civic-form-actions civic-role-actions">
        <button className="civic-primary-action" disabled={!selected || pending} type="submit">
          {action}
        </button>
      </div>
    </form>
  );
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

function isAdminRoleChoice(value: FormDataEntryValue | null): value is AdminRoleChoice {
  return value === "PARTICIPANT" || value === "ADMIN" || value === "HIGHEST_ADMIN";
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
        aria-current={activeId === "A-USER-002" ? "page" : undefined}
        href={userRoute("/admin/users/detail", selected)}
      >
        사용자·관리자 상세
      </Link>
      <Link
        aria-current={activeId === "A-USER-003" || activeId === "A-USER-004" ? "page" : undefined}
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
  if (id === "A-USER-003" || id === "A-USER-004") return "admin-role-editor";
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
      PARTICIPANT: "사용자",
      ADMIN: "운영 관리자",
      HIGHEST_ADMIN: "최고 관리자",
    }[role] ?? role
  );
}

function permissionLabel(permission: string): string {
  return (
    {
      RAG_ADMIN: "문서 관리",
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
