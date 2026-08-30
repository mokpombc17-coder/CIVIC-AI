"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { Route } from "next";
import Link from "next/link";
import { AdminCurrentOperations } from "@/components/admin/admin-current-operations";
import type { ScreenDefinition } from "@/lib/screens/registry";
import { adminUserLabel, requestAdminUserLabels } from "@/lib/admin/user-labels";
import {
  readRoomCreationRequestPage,
  type RoomCreationRequest,
} from "@/lib/admin/domain-contracts";
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
type UserDetailTab = "account" | "access" | "audit";
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
export type ChatRequestSummaryState =
  | { status: "loading" }
  | {
      status: "ready";
      count: number;
      hasMore: boolean;
      items: readonly RoomCreationRequest[];
      labels: ReadonlyMap<string, string>;
    }
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
  const [chatRequestSummary, setChatRequestSummary] = useState<ChatRequestSummaryState>({
    status: adminCurrentUser.permissions.includes("CHAT_ADMIN") ? "loading" : "forbidden",
  });
  const [activeTaskSummary, setActiveTaskSummary] = useState<AdminDomainMetricState>({
    status: adminCurrentUser.permissions.includes("VOTE_ADMIN") ? "loading" : "forbidden",
  });
  const [simulationWalletSummary, setSimulationWalletSummary] =
    useState<SimulationWalletMetricState>({
      status: adminCurrentUser.permissions.includes("SIMULATION_ADMIN") ? "loading" : "forbidden",
    });
  const [message, setMessage] = useState("");
  const [auditMessage, setAuditMessage] = useState("");
  const [auditLoading, setAuditLoading] = useState(false);
  const [userStatusFilter, setUserStatusFilter] = useState<UserStatusFilter>("all");
  const [userDrawerTab, setUserDrawerTab] = useState<UserDetailTab | null>(null);
  const [roleMutationPending, setRoleMutationPending] = useState(false);
  const userDrawerReturnFocus = useRef<HTMLButtonElement | null>(null);
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
    if (screen.id === "A-HOME-001" && canManageVote) void refreshActiveTaskSummary();
    if (screen.id === "A-HOME-001" && canManageSimulation) {
      void refreshSimulationWalletSummary();
    }
    return () => activeUserLoadGate.cancel();
    // Initial screen loaders are deliberately keyed by screen/permission, not mutable selection state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManageChat, canManageSimulation, canManageVote, canReadRag, screen.id]);

  useEffect(() => {
    if (screen.id !== "A-USER-001") return;
    const syncDrawerFromHistory = () => {
      const userId = userIdFromLocation();
      if (!userId) {
        setUserDrawerTab(null);
        return;
      }
      const knownUser = users.find((user) => user.user_id === userId);
      if (knownUser) setSelected(knownUser);
      setUserDrawerTab(userDetailTabFromLocation());
    };
    window.addEventListener("popstate", syncDrawerFromHistory);
    return () => window.removeEventListener("popstate", syncDrawerFromHistory);
  }, [screen.id, users]);

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
      const requestedUser =
        items.find((user) => user.user_id === requested) ??
        (await loadRequestedAdminUser(requested));
      if (!isCurrent()) return;
      if (!requestedUser) {
        setSelected(null);
        return setMessage("요청한 사용자를 불러오지 못했습니다.");
      }
      setSelected(requestedUser);
      if (screen.id === "A-USER-001") {
        const requestedTab = userDetailTabFromLocation();
        setUserDrawerTab(requestedTab);
        if (requestedTab === "audit") await loadAudit(requested);
      }
      return;
    }
    setSelected(items[0] ?? null);
    if (screen.id === "A-USER-001") setUserDrawerTab(null);
  }

  async function loadAudit(subjectId?: string) {
    const requested = subjectId ?? selected?.user_id ?? userIdFromLocation() ?? undefined;
    setAuditLoading(true);
    const items = await requestAdminAudit(requested);
    if (items === null) {
      setAudits([]);
      setAuditMessage("감사 이력을 불러오지 못했습니다. 다시 시도해 주세요.");
      setAuditLoading(false);
      return;
    }
    setAudits(items);
    const labels = await requestAdminUserLabels(
      items.flatMap((event) => [event.actor_id, event.subject_id].filter(Boolean) as string[]),
    );
    setAuditUserLabels(labels ?? new Map());
    setAuditMessage("");
    setAuditLoading(false);
  }

  async function refreshRagJobSummary() {
    setRagJobSummary(await loadRagJobSummary());
  }

  async function refreshChatRequestSummary() {
    setChatRequestSummary(await loadChatRequestSummary());
  }

  async function refreshActiveTaskSummary() {
    setActiveTaskSummary(await loadActiveTaskSummary());
  }

  async function refreshSimulationWalletSummary() {
    setSimulationWalletSummary(await loadSimulationWalletSummary());
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadUsers(String(new FormData(event.currentTarget).get("query") ?? ""));
  }

  function openUserDrawer(user: AdminUser, trigger: HTMLButtonElement) {
    userDrawerReturnFocus.current = trigger;
    setSelected(user);
    setUserDrawerTab("account");
    setMessage("");
    setAuditMessage("");
    window.history.pushState(null, "", userDrawerHref(user.user_id, "account"));
    void loadRequestedAdminUser(user.user_id).then((latest) => {
      if (!latest) return;
      setSelected((current) => (current?.user_id === latest.user_id ? latest : current));
    });
  }

  function closeUserDrawer() {
    const returnTarget = userDrawerReturnFocus.current;
    setUserDrawerTab(null);
    window.history.replaceState(null, "", "/admin/users");
    window.setTimeout(() => returnTarget?.focus(), 0);
  }

  function changeUserDrawerTab(tab: UserDetailTab) {
    if (!selected) return;
    setUserDrawerTab(tab);
    window.history.replaceState(null, "", userDrawerHref(selected.user_id, tab));
    if (tab === "audit") void loadAudit(selected.user_id);
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
      const updated = (await response.json()) as AdminUser;
      setSelected(updated);
      setUsers((current) =>
        current.map((user) => (user.user_id === updated.user_id ? updated : user)),
      );
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
          activeTaskSummary={activeTaskSummary}
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
            <>
              <UserTable
                onOpen={openUserDrawer}
                users={filterAdminUsers(users, userStatusFilter)}
              />
              {selected && userDrawerTab ? (
                <UserDetailDrawer
                  auditLoading={auditLoading}
                  auditMessage={auditMessage}
                  audits={audits}
                  message={message}
                  onClose={closeUserDrawer}
                  onRoleSubmit={saveRoles}
                  onTabChange={changeUserDrawerTab}
                  pending={roleMutationPending}
                  selected={selected}
                  tab={userDrawerTab}
                  userLabels={auditUserLabels}
                />
              ) : null}
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
          {screen.id !== "A-USER-001" || !userDrawerTab
            ? [message, auditMessage].filter(Boolean).map((currentMessage) => (
                <p
                  aria-live="polite"
                  className="civic-form-message"
                  key={currentMessage}
                  role="status"
                >
                  {currentMessage}
                </p>
              ))
            : null}
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

export function AdminHome({
  activeTaskSummary,
  canManageSimulation,
  canReadRag,
  ragJobSummary,
  chatRequestSummary,
  simulationWalletSummary,
}: {
  activeTaskSummary: AdminDomainMetricState;
  canManageSimulation: boolean;
  canReadRag: boolean;
  ragJobSummary: RagJobSummaryState;
  chatRequestSummary: ChatRequestSummaryState;
  simulationWalletSummary: SimulationWalletMetricState;
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
          <small>진행 중 과업</small>
          <strong>{metricCount(activeTaskSummary)}</strong>
          <span>{metricDescription(activeTaskSummary, "현재 진행 중")}</span>
        </li>
        <li className="wf-admin-metric">
          <small>시뮬레이션 사용 잔액</small>
          <strong>{simulationWalletBalance(simulationWalletSummary)}</strong>
        </li>
      </ul>
      {ragJobSummary.status === "ready" && ragJobSummary.recentFailures.length > 0 ? (
        <RagFailureSummary failures={ragJobSummary.recentFailures} />
      ) : null}
      <AdminPendingChatRequests state={chatRequestSummary} />
      <AdminCurrentOperations canManageSimulation={canManageSimulation} canReadRag={canReadRag} />
    </div>
  );
}

export function AdminPendingChatRequests({ state }: Readonly<{ state: ChatRequestSummaryState }>) {
  const items = state.status === "ready" ? state.items : [];

  return (
    <section
      aria-labelledby="civic-pending-chat-requests-title"
      className="civic-pending-chat-requests"
    >
      <header>
        <div>
          <small>채팅 운영</small>
          <h2 id="civic-pending-chat-requests-title">채팅방 승인 대기</h2>
          <p>새로 신청된 채팅방을 확인하고 승인 또는 반려할 수 있습니다.</p>
        </div>
        {state.status !== "forbidden" ? (
          <Link className="wf-button wf-button-secondary" href="/admin/chat/requests">
            전체 목록
          </Link>
        ) : null}
      </header>
      {state.status === "loading" ? (
        <p aria-live="polite" className="civic-pending-chat-requests-empty" role="status">
          승인 대기 목록을 확인하고 있습니다.
        </p>
      ) : null}
      {state.status === "forbidden" ? (
        <p className="civic-pending-chat-requests-empty">
          채팅 관리 권한이 있는 관리자만 승인 대기 목록을 확인할 수 있습니다.
        </p>
      ) : null}
      {state.status === "unavailable" ? (
        <p aria-live="polite" className="civic-pending-chat-requests-empty" role="status">
          승인 대기 목록을 불러오지 못했습니다. 전체 목록에서 다시 확인해 주세요.
        </p>
      ) : null}
      {state.status === "ready" && items.length === 0 ? (
        <p aria-live="polite" className="civic-pending-chat-requests-empty" role="status">
          승인 대기 중인 채팅방이 없습니다.
        </p>
      ) : null}
      {state.status === "ready" && items.length > 0 ? (
        <ul>
          {items.map((item) => (
            <li key={item.creationRequestId}>
              <div className="civic-pending-chat-request-copy">
                <strong>{item.name}</strong>
                <span>
                  {adminUserLabel(state.labels, item.requesterUserId)} ·{" "}
                  {formatDate(item.requestedAt)}
                </span>
                {item.description ? <p>{item.description}</p> : null}
              </div>
              <Link
                aria-label={`${item.name} 검토하기`}
                className="wf-button wf-button-primary civic-pending-chat-review"
                href={
                  `/admin/chat/requests?requestId=${encodeURIComponent(item.creationRequestId)}` as Route
                }
              >
                검토하기
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {state.status === "ready" && (state.hasMore || state.count > items.length) ? (
        <p className="civic-pending-chat-requests-more">
          먼저 접수된 {items.length}건을 표시했습니다. 나머지 신청은 전체 목록에서 확인해 주세요.
        </p>
      ) : null}
    </section>
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
): Promise<ChatRequestSummaryState> {
  try {
    const response = await request(
      "/api/v1/admin/room-creation-requests?status=PENDING&limit=100",
      { cache: "no-store" },
    );
    if (!response.ok) return { status: "unavailable" };
    const page = readRoomCreationRequestPage(await response.json());
    if (!page) return { status: "unavailable" };
    const labels =
      (await requestAdminUserLabels(
        page.items.map((item) => item.requesterUserId),
        request,
      )) ?? new Map();
    return {
      status: "ready",
      count: page.items.length,
      hasMore: page.hasNext,
      items: page.items.slice(0, 5),
      labels,
    };
  } catch {
    return { status: "unavailable" };
  }
}

export async function loadActiveTaskSummary(
  request: typeof fetch = authenticatedFetch,
): Promise<AdminDomainMetricState> {
  try {
    const response = await request("/api/v1/admin/tasks", { cache: "no-store" });
    if (!response.ok) return { status: "unavailable" };
    const value = await response.json();
    if (!Array.isArray(value)) return { status: "unavailable" };
    const count = value.filter((item) => {
      if (!item || typeof item !== "object") return false;
      return (item as Record<string, unknown>).status === "OPEN";
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
  return subjectId ? userDrawerHref(subjectId, "account") : null;
}

function UserTable({
  users,
  onOpen,
}: {
  users: AdminUser[];
  onOpen: (user: AdminUser, trigger: HTMLButtonElement) => void;
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
                <button
                  aria-controls="civic-user-detail-drawer"
                  className="civic-primary-action"
                  onClick={(event) => onOpen(user, event.currentTarget)}
                  type="button"
                >
                  사용자 상세
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UserDetailDrawer({
  selected,
  tab,
  audits,
  userLabels,
  auditLoading,
  pending,
  message,
  auditMessage,
  onClose,
  onTabChange,
  onRoleSubmit,
}: Readonly<{
  selected: AdminUser;
  tab: UserDetailTab;
  audits: AuditEvent[];
  userLabels: ReadonlyMap<string, string>;
  auditLoading: boolean;
  pending: boolean;
  message: string;
  auditMessage: string;
  onClose: () => void;
  onTabChange: (tab: UserDetailTab) => void;
  onRoleSubmit: (event: FormEvent<HTMLFormElement>) => void;
}>) {
  const drawerRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  return (
    <div className="civic-admin-detail-drawer-layer">
      <button
        aria-label="사용자 상세 닫기"
        className="civic-admin-detail-drawer-scrim"
        onClick={onClose}
        type="button"
      />
      <aside
        aria-labelledby="civic-user-detail-drawer-title"
        aria-modal="true"
        className="civic-admin-detail-drawer civic-user-detail-drawer"
        id="civic-user-detail-drawer"
        onKeyDown={handleKeyDown}
        ref={drawerRef}
        role="dialog"
      >
        <header>
          <div>
            <small>사용자 관리</small>
            <h2 id="civic-user-detail-drawer-title">사용자 상세</h2>
            <p>{selected.email}</p>
          </div>
          <button
            aria-label="사용자 상세 닫기"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            ×
          </button>
        </header>
        <div className="civic-user-detail-drawer-body">
          <div aria-label="사용자 상세 메뉴" className="civic-user-drawer-tabs" role="tablist">
            {(
              [
                ["account", "계정 정보"],
                ["access", "역할·권한"],
                ["audit", "변경 이력"],
              ] as const
            ).map(([value, label]) => (
              <button
                aria-controls={`civic-user-${value}-panel`}
                aria-selected={tab === value}
                id={`civic-user-${value}-tab`}
                key={value}
                onClick={() => onTabChange(value)}
                role="tab"
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
          <section
            aria-labelledby={`civic-user-${tab}-tab`}
            className="civic-user-drawer-panel"
            id={`civic-user-${tab}-panel`}
            role="tabpanel"
          >
            {tab === "account" ? <UserSummary selected={selected} /> : null}
            {tab === "access" ? (
              <RoleForm
                action={mainScreenPrimaryActions["A-USER-003"] ?? "권한 변경 저장"}
                key={roleFormKey(selected, "A-USER-003")}
                onSubmit={onRoleSubmit}
                pending={pending}
                selected={selected}
              />
            ) : null}
            {tab === "audit" ? (
              <UserAuditCards events={audits} loading={auditLoading} userLabels={userLabels} />
            ) : null}
          </section>
          {[message, tab === "audit" ? auditMessage : ""].filter(Boolean).map((currentMessage) => (
            <p aria-live="polite" className="civic-form-message" key={currentMessage} role="status">
              {currentMessage}
            </p>
          ))}
        </div>
      </aside>
    </div>
  );
}

function UserAuditCards({
  events,
  userLabels,
  loading,
}: Readonly<{
  events: AuditEvent[];
  userLabels: ReadonlyMap<string, string>;
  loading: boolean;
}>) {
  if (loading) return <p className="civic-user-audit-empty">변경 이력을 불러오는 중입니다.</p>;
  if (events.length === 0) {
    return <p className="civic-user-audit-empty">기록된 권한 변경 이력이 없습니다.</p>;
  }
  return (
    <ol aria-label="권한 변경 이력" className="civic-user-audit-cards">
      {events.map((event) => (
        <li key={event.event_id}>
          <header>
            <strong>{auditEventLabel(event.event_type)}</strong>
            <time dateTime={event.occurred_at}>{formatDate(event.occurred_at)}</time>
          </header>
          <dl>
            <div>
              <dt>변경 전</dt>
              <dd>{accessLabels(event.before_roles, event.before_permissions)}</dd>
            </div>
            <div>
              <dt>변경 후</dt>
              <dd>{accessLabels(event.after_roles, event.after_permissions)}</dd>
            </div>
            <div>
              <dt>실행자</dt>
              <dd>{adminUserLabel(userLabels, event.actor_id)}</dd>
            </div>
            <div>
              <dt>사유</dt>
              <dd>{event.reason ?? "—"}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ol>
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
        <span>역할</span>
        <strong>{selected?.roles.map(roleLabel).join(", ") || "없음"}</strong>
      </div>
      <div>
        <span>운영 권한</span>
        <strong>{selected?.permissions.map(permissionLabel).join(", ") || "없음"}</strong>
      </div>
    </div>
  );
}

function userIdFromLocation(): string | null {
  return typeof window === "undefined"
    ? null
    : new URLSearchParams(window.location.search).get("userId");
}

function userDetailTabFromLocation(): UserDetailTab {
  if (typeof window === "undefined") return "account";
  const tab = new URLSearchParams(window.location.search).get("tab");
  return tab === "access" || tab === "audit" ? tab : "account";
}

function userDrawerHref(userId: string, tab: UserDetailTab): string {
  return `/admin/users?userId=${encodeURIComponent(userId)}&tab=${tab}`;
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
