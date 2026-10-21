"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { Route } from "next";
import Link from "next/link";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { ConsoleDataGrid, type ConsoleColumn } from "@/components/admin/console/console-data-grid";
import {
  ConsoleBadge,
  ConsoleEmpty,
  ConsolePane,
  ConsoleSearchControl,
  ConsoleStatus,
  ConsoleTabs,
  ConsoleWorkspace,
  type ConsoleTabItem,
} from "@/components/admin/console/console-ui";
import type { ScreenDefinition } from "@/lib/screens/registry";
import { listCountLabel } from "@/lib/admin/list-count";
import { adminUserLabel, requestAdminUserLabels } from "@/lib/admin/user-labels";
import {
  accessLabels,
  accountStateLabel,
  ADMIN_PERMISSION_CODES,
  ADMIN_ROLE_CHOICES,
  adminRoleMutationPath,
  appendAdminUserPage,
  auditEventLabel,
  createLatestAdminUserRequestGate,
  createMutationLock,
  filterAdminUsers,
  formatAdminDate,
  hasAdminAccessRevocation,
  isAdminRoleChoice,
  loadRequestedAdminUser,
  loadRoleConflictUser,
  permissionLabel,
  permissionsForAdminRole,
  ADMIN_AUDIT_SERVER_WINDOW,
  requestAdminAuditWindow,
  requestAdminUsers,
  roleFormKey,
  roleLabel,
  selectedAdminRole,
  type AdminRoleChoice,
  type AdminUser,
  type AuditEvent,
  type UserStatusFilter,
} from "@/lib/admin/user-admin";
import {
  loadUserRagUsage,
  loadUserRoomRequests,
  scanUserChatParticipation,
  scanUserVoteParticipation,
  type ActivityScanState,
  type UserChatScanResult,
  type UserRagUsageState,
  type UserRoomRequestsState,
  type UserVoteScanResult,
} from "@/lib/admin/user-activity";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";
import { koreanMessage } from "@/lib/user-facing-message";

export type UserWorkspaceTab = "overview" | "roles" | "audit" | "activity";

export function userWorkspaceTabForScreen(screenId: string, searchTab?: string): UserWorkspaceTab {
  if (searchTab === "activity") return "activity";
  if (screenId === "A-USER-003" || screenId === "A-USER-004") return "roles";
  if (screenId === "A-USER-005") return "audit";
  return "overview";
}

export function userWorkspacePath(tab: UserWorkspaceTab, userId: string | null): string {
  const base =
    tab === "roles"
      ? "/admin/users/roles"
      : tab === "audit"
        ? "/admin/users/audit"
        : "/admin/users/detail";
  const params = new URLSearchParams();
  if (userId) params.set("userId", userId);
  if (tab === "activity") params.set("tab", "activity");
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

// 상세 패널에 그대로 나오는 값(계정 상태·운영 권한·최근 활동)은 목록에서 뺀다.
export const USER_GRID_COLUMNS: ReadonlyArray<ConsoleColumn<AdminUser>> = [
  { field: "email", headerName: "이메일", flex: 2, minWidth: 180 },
  {
    headerName: "역할",
    valueGetter: (params) =>
      params.data?.roles
        .filter((role) => role !== "PARTICIPANT")
        .map(roleLabel)
        .join(", ") || "없음",
  },
];

export const AUDIT_GRID_COLUMNS: ReadonlyArray<ConsoleColumn<AuditRow>> = [
  { field: "eventLabel", headerName: "이벤트", minWidth: 110 },
  { field: "actorLabel", headerName: "실행자", minWidth: 120 },
  { field: "subjectLabel", headerName: "대상", minWidth: 120 },
  { field: "beforeLabel", headerName: "변경 전", flex: 2, minWidth: 130 },
  { field: "afterLabel", headerName: "변경 후", flex: 2, minWidth: 130 },
  { field: "reason", headerName: "사유", flex: 2, minWidth: 130 },
  { field: "occurredLabel", headerName: "변경 시각", minWidth: 130 },
];

export type AuditRow = Readonly<{
  eventId: string;
  eventLabel: string;
  actorLabel: string;
  subjectLabel: string;
  subjectId: string | null;
  beforeLabel: string;
  afterLabel: string;
  reason: string;
  occurredLabel: string;
}>;

export function auditRowFromEvent(
  event: AuditEvent,
  userLabels: ReadonlyMap<string, string>,
): AuditRow {
  return {
    eventId: event.event_id,
    eventLabel: auditEventLabel(event.event_type),
    actorLabel: adminUserLabel(userLabels, event.actor_id),
    subjectLabel: adminUserLabel(userLabels, event.subject_id),
    subjectId: event.subject_id ?? null,
    beforeLabel: accessLabels(event.before_roles, event.before_permissions),
    afterLabel: accessLabels(event.after_roles, event.after_permissions),
    reason: event.reason ?? "—",
    occurredLabel: formatAdminDate(event.occurred_at),
  };
}

type PendingRoleChange = Readonly<{
  roles: AdminRoleChoice[];
  permissions: string[];
  reason: string;
}>;

export function AdminUserWorkspace({ screen }: Readonly<{ screen: ScreenDefinition }>) {
  const initialSearchTab =
    typeof window === "undefined"
      ? undefined
      : (new URLSearchParams(window.location.search).get("tab") ?? undefined);
  const [tab, setTab] = useState<UserWorkspaceTab>(() =>
    userWorkspaceTabForScreen(screen.id, initialSearchTab),
  );
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userTotal, setUserTotal] = useState<number | null>(null);
  const [userNextCursor, setUserNextCursor] = useState<string | null>(null);
  const [userQuery, setUserQuery] = useState("");
  const [usersLoadingMore, setUsersLoadingMore] = useState(false);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [message, setMessage] = useState("");
  const [userStatusFilter, setUserStatusFilter] = useState<UserStatusFilter>("all");
  const [audits, setAudits] = useState<AuditEvent[]>([]);
  const [auditWindowFull, setAuditWindowFull] = useState(false);
  const [auditUserLabels, setAuditUserLabels] = useState<Map<string, string>>(new Map());
  const [auditMessage, setAuditMessage] = useState("");
  const [roleMutationPending, setRoleMutationPending] = useState(false);
  const [pendingRoleChange, setPendingRoleChange] = useState<PendingRoleChange | null>(null);
  const roleMutationLock = useRef(createMutationLock());
  const userLoadGate = useRef(createLatestAdminUserRequestGate());
  const [requests, setRequests] = useState<UserRoomRequestsState>({ status: "loading" });
  const [chatScan, setChatScan] = useState<ActivityScanState<UserChatScanResult>>({
    status: "idle",
  });
  const [voteScan, setVoteScan] = useState<ActivityScanState<UserVoteScanResult>>({
    status: "idle",
  });
  const [ragUsage, setRagUsage] = useState<UserRagUsageState>({ status: "loading" });
  const selectedUserId = selected?.user_id ?? null;

  const startChatScan = useCallback(() => {
    if (!selectedUserId) return;
    runScan(setChatScan, (onProgress) => scanUserChatParticipation(selectedUserId, onProgress));
  }, [selectedUserId]);

  const startVoteScan = useCallback(() => {
    if (!selectedUserId) return;
    runScan(setVoteScan, (onProgress) => scanUserVoteParticipation(selectedUserId, onProgress));
  }, [selectedUserId]);

  // 선택이 바뀌면 개설 신청·AI 질의는 즉시 조회하고, 투표 참여는 자동으로 확인한다.
  // 대화 참여는 대화 원본을 내려받아야 해서 버튼으로만 시작한다.
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      setChatScan({ status: "idle" });
      setVoteScan({ status: "idle" });
      setRequests({ status: "loading" });
      setRagUsage({ status: "loading" });
      if (!selectedUserId) return;
      void loadUserRoomRequests(selectedUserId).then((state) => {
        if (!cancelled) setRequests(state);
      });
      void loadUserRagUsage(selectedUserId).then((state) => {
        if (!cancelled) setRagUsage(state);
      });
      runScan(setVoteScan, (onProgress) => scanUserVoteParticipation(selectedUserId, onProgress));
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [selectedUserId]);

  const loadUsers = useCallback(async (query = "", status: UserStatusFilter = "all") => {
    const isCurrent = userLoadGate.current.begin();
    setUsersLoadingMore(false);
    const page = await requestAdminUsers(query, undefined, status);
    if (!isCurrent()) return;
    if (page === null) {
      setUsers([]);
      setUserTotal(null);
      setUserNextCursor(null);
      setSelected(null);
      setMessage("사용자 목록을 불러오지 못했습니다.");
      return;
    }
    const items = page.items;
    setUsers(items);
    setUserTotal(page.total);
    setUserNextCursor(page.nextCursor);
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
        setMessage("요청한 사용자를 불러오지 못했습니다.");
        return;
      }
      setSelected(requestedUser);
      return;
    }
    setSelected(items[0] ?? null);
  }, []);

  useEffect(() => {
    const activeGate = userLoadGate.current;
    const timer = window.setTimeout(() => void loadUsers(), 0);
    return () => {
      window.clearTimeout(timer);
      activeGate.cancel();
    };
  }, [loadUsers]);

  const loadAudit = useCallback(async (subjectId: string | undefined) => {
    const auditWindow = await requestAdminAuditWindow(subjectId);
    if (auditWindow === null) {
      setAudits([]);
      setAuditWindowFull(false);
      setAuditMessage("감사 이력을 불러오지 못했습니다. 다시 시도해 주세요.");
      return;
    }
    const items = auditWindow.items;
    setAudits(items);
    setAuditWindowFull(auditWindow.windowFull);
    const labels = await requestAdminUserLabels(
      items.flatMap((event) => [event.actor_id, event.subject_id].filter(Boolean) as string[]),
    );
    setAuditUserLabels(labels ?? new Map());
    setAuditMessage("");
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (tab === "audit" || tab === "overview") void loadAudit(selected?.user_id);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAudit, selected?.user_id, tab]);

  function switchTab(nextTab: UserWorkspaceTab) {
    setTab(nextTab);
    syncUrl(nextTab, selected?.user_id ?? null);
  }

  function selectUser(user: AdminUser) {
    setSelected(user);
    syncUrl(tab, user.user_id);
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = String(new FormData(event.currentTarget).get("query") ?? "");
    setUserQuery(query);
    await loadUsers(query, userStatusFilter);
  }

  function changeUserStatusFilter(status: UserStatusFilter) {
    setUserStatusFilter(status);
    void loadUsers(userQuery, status);
  }

  async function loadMoreUsers() {
    if (!userNextCursor || usersLoadingMore) return;
    const isCurrent = userLoadGate.current.begin();
    setUsersLoadingMore(true);
    const page = await requestAdminUsers(userQuery, undefined, userStatusFilter, userNextCursor);
    if (!isCurrent()) return;
    setUsersLoadingMore(false);
    if (page === null) {
      setMessage("사용자 목록을 더 불러오지 못했습니다. 다시 시도해 주세요.");
      return;
    }
    setUsers((current) => appendAdminUserPage(current, page.items));
    setUserTotal(page.total);
    setUserNextCursor(page.nextCursor);
    setMessage("");
  }

  function submitRoles(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const data = new FormData(event.currentTarget);
    const role = data.get("roles");
    if (!isAdminRoleChoice(role)) {
      setMessage("변경할 역할을 선택해 주세요.");
      return;
    }
    const roles: AdminRoleChoice[] = [role];
    const permissions = permissionsForAdminRole(role, data.getAll("permissions").map(String));
    const reason = String(data.get("reason") ?? "").trim();
    if (!reason) {
      setMessage("권한 변경 사유를 입력해 주세요.");
      return;
    }
    const change: PendingRoleChange = { roles, permissions, reason };
    if (hasAdminAccessRevocation(selected.roles, selected.permissions, roles, permissions)) {
      setPendingRoleChange(change);
      return;
    }
    void saveRoles(change);
  }

  async function saveRoles(change: PendingRoleChange) {
    if (!selected) return;
    const impactConfirmed = hasAdminAccessRevocation(
      selected.roles,
      selected.permissions,
      change.roles,
      change.permissions,
    );
    if (!roleMutationLock.current.tryBegin()) return;
    setRoleMutationPending(true);
    try {
      const response = await authenticatedFetch(adminRoleMutationPath(selected.user_id), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roles: change.roles,
          permissions: change.permissions,
          row_version: selected.row_version,
          reason: change.reason,
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
          setMessage(
            koreanMessage(problem.detail, "다른 관리자가 변경한 최신 권한 상태를 불러왔습니다."),
          );
          return;
        }
        setMessage(
          koreanMessage(
            problem.detail,
            "권한 변경을 저장하지 못했습니다. 최신 상태를 다시 확인해 주세요.",
          ),
        );
        return;
      }
      const saved = (await response.json()) as AdminUser;
      setSelected(saved);
      setUsers((current) => current.map((user) => (user.user_id === saved.user_id ? saved : user)));
      setMessage("권한 변경을 저장했습니다. 변경 내역은 권한 이력 탭에 기록됩니다.");
    } catch {
      setMessage("네트워크 오류로 권한 변경을 저장하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      roleMutationLock.current.end();
      setRoleMutationPending(false);
    }
  }

  const filteredUsers = filterAdminUsers(users, userStatusFilter);
  const tabs: readonly ConsoleTabItem[] = [
    { id: "overview", label: "개요" },
    { id: "roles", label: "권한 편집" },
    { id: "audit", label: "권한 이력" },
  ];

  return (
    <ConsoleWorkspace layout="admin-user-console">
      <ConsolePane
        ariaLabel="사용자 목록"
        subtitle={listCountLabel({
          shown: filteredUsers.length,
          total: userTotal,
          hasMore: userNextCursor !== null,
          unit: "명",
        })}
        title="사용자 검색"
      >
        <form className="console-toolbar" onSubmit={search} role="search">
          <ConsoleSearchControl
            ariaLabel="이메일 검색"
            name="query"
            placeholder="이메일 주소를 검색해 주세요."
          />
        </form>
        <div aria-label="사용자 상태 필터" className="console-filter-group" role="group">
          {(
            [
              ["all", "전체"],
              ["active", "활성"],
              ["inactive", "비활성"],
              ["admin", "관리자"],
            ] as const
          ).map(([value, label]) => (
            <button
              aria-pressed={userStatusFilter === value}
              key={value}
              onClick={() => changeUserStatusFilter(value)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        <ConsoleDataGrid
          ariaLabel="사용자 목록 표"
          columnDefs={USER_GRID_COLUMNS}
          emptyText="조건에 맞는 사용자가 없습니다."
          getRowId={(user) => user.user_id}
          height={480}
          onRowClicked={selectUser}
          rowData={filteredUsers}
          selectedRowId={selected?.user_id ?? null}
        />
        {userNextCursor ? (
          <button
            className="wf-button wf-button-secondary civic-load-more"
            disabled={usersLoadingMore}
            onClick={() => void loadMoreUsers()}
            type="button"
          >
            더 불러오기
          </button>
        ) : null}
        {message ? <ConsoleStatus>{message}</ConsoleStatus> : null}
      </ConsolePane>

      <ConsolePane
        ariaLabel="사용자 상세"
        {...(selected ? { subtitle: accountStateLabel(selected.account_state) } : {})}
        title={selected?.email ?? "사용자를 선택하세요"}
      >
        <ConsoleTabs
          activeId={tab}
          ariaLabel="사용자 상세 탭"
          onSelect={(id) => switchTab(id as UserWorkspaceTab)}
          tabs={tabs}
        />
        {tab === "overview" ? (
          <UserOverviewTab
            auditWindowFull={auditWindowFull}
            audits={audits}
            onOpenAudit={() => switchTab("audit")}
            onOpenRoles={() => switchTab("roles")}
            selected={selected}
            userLabels={auditUserLabels}
          />
        ) : null}
        {tab === "roles" ? (
          <RoleForm
            key={roleFormKey(selected, screen.id)}
            onSubmit={submitRoles}
            pending={roleMutationPending}
            selected={selected}
          />
        ) : null}
        {tab === "audit" ? (
          <>
            <ConsoleDataGrid
              ariaLabel="감사 이력 표"
              columnDefs={AUDIT_GRID_COLUMNS}
              emptyText={
                auditWindowFull
                  ? `최근 ${ADMIN_AUDIT_SERVER_WINDOW}건 안에는 선택한 사용자의 권한 변경 이력이 없습니다.`
                  : "선택한 사용자의 권한 변경 이력이 없습니다."
              }
              getRowId={(row) => row.eventId}
              height={420}
              rowData={audits.map((event) => auditRowFromEvent(event, auditUserLabels))}
            />
            {auditWindowFull ? (
              <ConsoleStatus>
                {`최근 감사 이력 ${ADMIN_AUDIT_SERVER_WINDOW}건 기준으로 표시합니다. 그보다 오래된 이력은 이 화면에서 볼 수 없습니다.`}
              </ConsoleStatus>
            ) : null}
            {auditMessage ? <ConsoleStatus error>{auditMessage}</ConsoleStatus> : null}
          </>
        ) : null}
        {tab === "activity" ? (
          <UserActivityTab
            chatScan={chatScan}
            onStartChatScan={startChatScan}
            onStartVoteScan={startVoteScan}
            ragUsage={ragUsage}
            requests={requests}
            selected={selected}
            voteScan={voteScan}
          />
        ) : null}
      </ConsolePane>

      <ConfirmDialog
        busy={roleMutationPending}
        confirmLabel="회수 확정 후 저장"
        description={
          <>
            <p>
              이 변경은 <strong>{selected?.email ?? "선택한 사용자"}</strong>의 관리자 역할 또는
              운영 권한을 회수합니다. 저장 즉시 해당 계정은 관련 관리자 화면에 접근할 수 없습니다.
            </p>
            <p>변경 내역은 감사 이력에 기록됩니다.</p>
          </>
        }
        destructive
        onCancel={() => setPendingRoleChange(null)}
        onConfirm={() => {
          const change = pendingRoleChange;
          setPendingRoleChange(null);
          if (change) void saveRoles(change);
        }}
        open={pendingRoleChange !== null}
        title="권한 회수 영향 확인"
      />
    </ConsoleWorkspace>
  );
}

function syncUrl(tab: UserWorkspaceTab, userId: string | null) {
  if (typeof window === "undefined") return;
  window.history.replaceState(window.history.state, "", userWorkspacePath(tab, userId));
}

export function chatSummaryValue(state: ActivityScanState<UserChatScanResult>): string {
  if (state.status === "ready") {
    const count = state.result.participations.length;
    if (state.result.failedRooms > 0 || state.result.truncated) {
      return count > 0 ? `${count}개 이상` : "확인 불가";
    }
    return `${count}개`;
  }
  if (state.status === "running") return "확인 중";
  if (state.status === "failed") return "확인 불가";
  return "미확인";
}

export function voteSummaryValue(state: ActivityScanState<UserVoteScanResult>): string {
  if (state.status === "ready") {
    return state.result.identifiersMissing
      ? "확인 불가"
      : `${state.result.participations.length}건`;
  }
  if (state.status === "running") return "확인 중";
  if (state.status === "failed") return "확인 불가";
  return "미확인";
}

export function ragSummaryValue(state: UserRagUsageState): string {
  if (state.status === "ready") return `${state.usage.totalQueries}회`;
  if (state.status === "loading") return "확인 중";
  if (state.status === "forbidden") return "권한 없음";
  return "확인 불가";
}

function UserOverviewTab({
  selected,
  audits,
  auditWindowFull,
  userLabels,
  onOpenRoles,
  onOpenAudit,
}: Readonly<{
  selected: AdminUser | null;
  audits: readonly AuditEvent[];
  auditWindowFull: boolean;
  userLabels: ReadonlyMap<string, string>;
  onOpenRoles: () => void;
  onOpenAudit: () => void;
}>) {
  if (!selected) {
    return <ConsoleEmpty title="목록에서 사용자를 선택하세요." />;
  }
  const recent = audits.slice(0, 5);
  return (
    <>
      <div className="console-field-grid">
        <div>
          <span>이메일</span>
          <strong>{selected.email}</strong>
        </div>
        <div>
          <span>이메일 인증</span>
          <strong>{selected.email_verified_at ? "인증 완료" : "확인 필요"}</strong>
        </div>
        <div>
          <span>계정 상태</span>
          <strong>{accountStateLabel(selected.account_state)}</strong>
        </div>
        <div>
          <span>역할</span>
          <strong>{selected.roles.map(roleLabel).join(", ") || "없음"}</strong>
        </div>
        <div>
          <span>운영 권한</span>
          <strong>{selected.permissions.map(permissionLabel).join(", ") || "없음"}</strong>
        </div>
        <div>
          <span>최근 활동</span>
          <strong>{formatAdminDate(selected.last_activity_at)}</strong>
        </div>
      </div>
      <div className="console-actions">
        <button className="civic-primary-action" onClick={onOpenRoles} type="button">
          권한 편집
        </button>
      </div>
      <section className="console-section">
        <h4>최근 권한 변경 이력</h4>
        {recent.length === 0 ? (
          <ConsoleStatus>
            {auditWindowFull
              ? `최근 ${ADMIN_AUDIT_SERVER_WINDOW}건 안에는 이 사용자에 대한 권한 변경 이력이 없습니다.`
              : "이 사용자에 대한 권한 변경 이력이 없습니다."}
          </ConsoleStatus>
        ) : (
          <ul className="console-metrics console-field-grid is-stacked">
            {recent.map((event) => {
              const row = auditRowFromEvent(event, userLabels);
              return (
                <li className="console-metric" key={event.event_id}>
                  <small>{row.occurredLabel}</small>
                  <strong>{row.eventLabel}</strong>
                  <span>
                    {row.beforeLabel} → {row.afterLabel} · {row.reason}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <div className="console-actions">
          <button className="wf-button wf-button-secondary" onClick={onOpenAudit} type="button">
            전체 이력 보기
          </button>
        </div>
      </section>
    </>
  );
}

function RoleForm({
  selected,
  onSubmit,
  pending,
}: Readonly<{
  selected: AdminUser | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  pending: boolean;
}>) {
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
      <fieldset aria-describedby="operating-permission-help" className="wf-role-section">
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
      <div className="console-actions">
        <button className="civic-primary-action" disabled={!selected || pending} type="submit">
          권한 변경 저장
        </button>
      </div>
    </form>
  );
}

function UserActivityTab({
  selected,
  requests,
  chatScan,
  voteScan,
  ragUsage,
  onStartChatScan,
  onStartVoteScan,
}: Readonly<{
  selected: AdminUser | null;
  requests: UserRoomRequestsState;
  chatScan: ActivityScanState<UserChatScanResult>;
  voteScan: ActivityScanState<UserVoteScanResult>;
  ragUsage: UserRagUsageState;
  onStartChatScan: () => void;
  onStartVoteScan: () => void;
}>) {
  if (!selected) {
    return <ConsoleEmpty title="목록에서 사용자를 선택하세요." />;
  }

  return (
    <>
      <section className="console-section" data-wireflow-layout="admin-user-activity-requests">
        <h4>토론방 개설 신청</h4>
        <RoomRequestsSection state={requests} />
      </section>

      <section className="console-section" data-wireflow-layout="admin-user-activity-chat">
        <h4>대화 참여 토론방</h4>
        <p className="console-status">
          대화 기록을 내려받아 이 사용자가 작성한 메시지를 집계합니다. 시간이 다소 걸릴 수 있습니다.
        </p>
        <ScanSection
          idleLabel="대화 참여 확인"
          onStart={onStartChatScan}
          renderResult={(result) => <ChatScanResultView result={result} />}
          state={chatScan}
        />
      </section>

      <section className="console-section" data-wireflow-layout="admin-user-activity-votes">
        <h4>투표 참여</h4>
        <ScanSection
          idleLabel="투표 참여 확인"
          onStart={onStartVoteScan}
          renderResult={(result) => <VoteScanResultView result={result} />}
          state={voteScan}
        />
      </section>

      <section className="console-section" data-wireflow-layout="admin-user-activity-rag">
        <h4>AI 질의</h4>
        <RagUsageSection state={ragUsage} />
      </section>
    </>
  );
}

function RagUsageSection({ state }: Readonly<{ state: UserRagUsageState }>) {
  if (state.status === "loading") return <ConsoleStatus>질의 사용량 확인 중…</ConsoleStatus>;
  if (state.status === "forbidden") {
    return <ConsoleStatus>문서 관리자 권한이 있어야 확인할 수 있습니다.</ConsoleStatus>;
  }
  if (state.status === "unavailable") {
    return <ConsoleStatus error>질의 사용량을 불러오지 못했습니다.</ConsoleStatus>;
  }
  const { usage } = state;
  return (
    <>
      <div className="console-field-grid">
        <div>
          <span>총 질의</span>
          <strong>{usage.totalQueries}회</strong>
        </div>
        <div>
          <span>마지막 질의</span>
          <strong>{formatAdminDate(usage.lastQueryAt)}</strong>
        </div>
      </div>
      {usage.recentQuestions.length > 0 ? (
        <ul aria-label="최근 질문 목록" className="console-metrics console-field-grid is-stacked">
          {usage.recentQuestions.map((entry, index) => (
            <li className="console-metric" key={`${entry.askedAt ?? "unknown"}-${index}`}>
              <small>{formatAdminDate(entry.askedAt)}</small>
              <strong>{entry.question}</strong>
            </li>
          ))}
        </ul>
      ) : (
        <ConsoleStatus>기록된 질문이 없습니다.</ConsoleStatus>
      )}
    </>
  );
}

function runScan<T>(
  setState: (state: ActivityScanState<T>) => void,
  scan: (onProgress: (done: number, total: number) => void) => Promise<T>,
) {
  setState({ status: "running", done: 0, total: 0 });
  void scan((done, total) => setState({ status: "running", done, total }))
    .then((result) => setState({ status: "ready", result }))
    .catch((error: unknown) =>
      setState({
        status: "failed",
        message: error instanceof Error ? error.message : "확인에 실패했습니다.",
      }),
    );
}

function ScanSection<T>({
  state,
  idleLabel,
  onStart,
  renderResult,
}: Readonly<{
  state: ActivityScanState<T>;
  idleLabel: string;
  onStart: () => void;
  renderResult: (result: T) => ReactNode;
}>) {
  if (state.status === "idle") {
    return (
      <div className="console-actions is-start">
        <button className="wf-button wf-button-secondary" onClick={onStart} type="button">
          {idleLabel}
        </button>
      </div>
    );
  }
  if (state.status === "running") {
    return (
      <ConsoleStatus>
        확인 중… {state.total > 0 ? `${state.done}/${state.total}` : ""}
      </ConsoleStatus>
    );
  }
  if (state.status === "failed") {
    return (
      <>
        <ConsoleStatus error>{state.message}</ConsoleStatus>
        <div className="console-actions is-start">
          <button className="wf-button wf-button-secondary" onClick={onStart} type="button">
            다시 시도
          </button>
        </div>
      </>
    );
  }
  return renderResult(state.result);
}

function RoomRequestsSection({ state }: Readonly<{ state: UserRoomRequestsState }>) {
  if (state.status === "loading") return <ConsoleStatus>신청 이력 확인 중…</ConsoleStatus>;
  if (state.status === "forbidden") {
    return <ConsoleStatus>채팅 관리자 권한이 있어야 확인할 수 있습니다.</ConsoleStatus>;
  }
  if (state.status === "unavailable") {
    return <ConsoleStatus error>신청 이력을 불러오지 못했습니다.</ConsoleStatus>;
  }
  if (state.items.length === 0) {
    return <ConsoleStatus>이 사용자가 개설을 신청한 토론방이 없습니다.</ConsoleStatus>;
  }
  return (
    <ul
      aria-label="토론방 개설 신청 목록"
      className="console-metrics console-field-grid is-stacked"
    >
      {state.items.map((item) => (
        <li className="console-metric" key={item.creationRequestId}>
          <small>{formatAdminDate(item.requestedAt)}</small>
          <strong>{item.name}</strong>
          <span>
            <ConsoleBadge
              tone={
                item.status === "APPROVED"
                  ? "success"
                  : item.status === "REJECTED"
                    ? "danger"
                    : "active"
              }
            >
              {requestStatusLabel(item.status)}
            </ConsoleBadge>{" "}
            {item.roomId ? (
              <Link href={`/admin/chat?roomId=${encodeURIComponent(item.roomId)}` as Route}>
                토론방 열기
              </Link>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

function requestStatusLabel(status: string): string {
  return { PENDING: "승인 대기", APPROVED: "승인됨", REJECTED: "반려됨" }[status] ?? status;
}

function ChatScanResultView({ result }: Readonly<{ result: UserChatScanResult }>) {
  const successfulRooms = result.scannedRooms - result.failedRooms;
  return (
    <>
      {result.participations.length === 0 ? (
        successfulRooms === 0 && result.failedRooms > 0 ? (
          <ConsoleStatus error>
            대화 기록을 불러오지 못해 이 사용자의 토론방 참여 여부를 확인할 수 없습니다.
          </ConsoleStatus>
        ) : (
          <ConsoleStatus>
            조회에 성공한 {successfulRooms}개 토론방에서 이 사용자의 메시지를 찾지 못했습니다.
          </ConsoleStatus>
        )
      ) : (
        <ul
          aria-label="대화 참여 토론방 목록"
          className="console-metrics console-field-grid is-stacked"
        >
          {result.participations.map((room) => (
            <li className="console-metric" key={room.roomId}>
              <small>{room.roomStatus === "ACTIVE" ? "운영 중" : "종료됨"}</small>
              <strong>{room.roomName}</strong>
              <span>
                작성 메시지 {room.messageCount}건
                {room.lastMessageAt ? ` · 마지막 작성 ${formatAdminDate(room.lastMessageAt)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      {result.truncated || result.failedRooms > 0 ? (
        <ConsoleStatus>
          {result.truncated
            ? `${result.moreRooms ? `${result.totalRooms}개 이상` : `전체 ${result.totalRooms}개`} 중 최근 ${result.scannedRooms}개 토론방만 확인했습니다. `
            : ""}
          {result.failedRooms > 0 ? `${result.failedRooms}개 방은 내보내기에 실패했습니다.` : ""}
        </ConsoleStatus>
      ) : null}
    </>
  );
}

function VoteScanResultView({ result }: Readonly<{ result: UserVoteScanResult }>) {
  return (
    <>
      {result.identifiersMissing ? (
        <ConsoleStatus>
          상세 결과 데이터에 참여자 식별자가 포함되어 있지 않아 참여 여부를 확인할 수 없습니다.
        </ConsoleStatus>
      ) : result.participations.length === 0 ? (
        <ConsoleStatus>
          {result.scannedTasks}개 종료 투표에서 이 사용자의 응답을 찾지 못했습니다.
        </ConsoleStatus>
      ) : (
        <ul aria-label="투표 참여 목록" className="console-metrics console-field-grid is-stacked">
          {result.participations.map((vote) => (
            <li className="console-metric" key={vote.taskId}>
              <small>
                제출 {formatAdminDate(vote.submittedAt)} · 마감 {formatAdminDate(vote.closedAt)}
              </small>
              <strong>{vote.taskTitle}</strong>
              {vote.answerLabel ? <span>선택: {vote.answerLabel}</span> : null}
              <span>
                <Link
                  href={`/admin/tasks/results?taskId=${encodeURIComponent(vote.taskId)}` as Route}
                >
                  투표 결과 보기
                </Link>
              </span>
            </li>
          ))}
        </ul>
      )}
      {result.truncated || result.failedTasks > 0 ? (
        <ConsoleStatus>
          {result.truncated
            ? `종료 투표 ${result.totalClosedTasks}개 중 최근 ${result.scannedTasks}개만 확인했습니다. `
            : ""}
          {result.failedTasks > 0 ? `${result.failedTasks}개 투표는 결과 조회에 실패했습니다.` : ""}
        </ConsoleStatus>
      ) : null}
    </>
  );
}

export { RoleForm as AdminUserRoleForm };
