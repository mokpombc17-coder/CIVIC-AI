"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { Route } from "next";
import Link from "next/link";
import { AdminCurrentOperations } from "@/components/admin/admin-current-operations";
import { AdminUserWorkspace } from "@/components/admin/admin-user-workspace";
import { ConsoleMetricStrip } from "@/components/admin/console/console-ui";
import { formatKrw } from "@/lib/admin/format";
import type { ScreenDefinition } from "@/lib/screens/registry";
import { adminUserLabel, requestAdminUserLabels } from "@/lib/admin/user-labels";
import {
  readRoomCreationRequestPage,
  readTaskSummaries,
  type RoomCreationRequest,
} from "@/lib/admin/domain-contracts";
import {
  readSimulationTaskSummaries,
  simulationTargetHref,
  simulationTargetPresentation,
} from "@/lib/admin/simulation-contracts";
import { readWalletSummary, type WalletSummary } from "@/lib/admin/simulation-billing-contracts";
import { formatAdminDate } from "@/lib/admin/user-admin";
import { ScreenFrame } from "./screen-frame";
import type { CurrentUser } from "@/lib/auth/shell-access";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";

// User/permission helpers moved to lib/admin/user-admin.ts; re-exported here
// because tests and older call sites import them from this module.
export {
  ADMIN_PERMISSION_CODES,
  adminRoleMutationPath,
  auditSubjectHref,
  createLatestAdminUserRequestGate,
  createMutationLock,
  filterAdminUsers,
  hasAdminAccessRevocation,
  loadRequestedAdminUser,
  loadRoleConflictUser,
  permissionsForAdminRole,
  requestAdminAudit,
  requestAdminUsers,
  roleFormKey,
  selectedAdminRole,
  userBackHref,
  userRoute,
  type AdminRoleChoice,
} from "@/lib/admin/user-admin";

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
export type HomeTaskDeadline = Readonly<{ taskId: string; title: string; closesAt: string }>;
export type HomeTaskActivityState = Readonly<{
  active: AdminDomainMetricState;
  dueSoon: AdminDomainMetricState;
  dueSoonItems: readonly HomeTaskDeadline[];
  upcomingItems: readonly Readonly<{ taskId: string; title: string; opensAt: string }>[];
}>;
export type HomeAttentionSimulation = Readonly<{
  taskId: string;
  title: string;
  stateLabel: string;
  href: string;
}>;
export type HomeAttentionSimulationState =
  | { status: "loading" }
  | { status: "ready"; count: number; items: readonly HomeAttentionSimulation[] }
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
  const [ragJobSummary, setRagJobSummary] = useState<RagJobSummaryState>({ status: "loading" });
  const [chatRequestSummary, setChatRequestSummary] = useState<ChatRequestSummaryState>({
    status: adminCurrentUser.permissions.includes("CHAT_ADMIN") ? "loading" : "forbidden",
  });
  const [activeTaskSummary, setActiveTaskSummary] = useState<AdminDomainMetricState>({
    status: adminCurrentUser.permissions.includes("VOTE_ADMIN") ? "loading" : "forbidden",
  });
  const [dueSoonTaskSummary, setDueSoonTaskSummary] = useState<AdminDomainMetricState>({
    status: adminCurrentUser.permissions.includes("VOTE_ADMIN") ? "loading" : "forbidden",
  });
  const [activeRoomSummary, setActiveRoomSummary] = useState<AdminDomainMetricState>({
    status: adminCurrentUser.permissions.includes("CHAT_ADMIN") ? "loading" : "forbidden",
  });
  const [dueSoonTasks, setDueSoonTasks] = useState<readonly HomeTaskDeadline[]>([]);
  const [upcomingTasks, setUpcomingTasks] = useState<
    readonly Readonly<{ taskId: string; title: string; opensAt: string }>[]
  >([]);
  const [attentionSimulations, setAttentionSimulations] = useState<HomeAttentionSimulationState>({
    status: adminCurrentUser.permissions.includes("SIMULATION_ADMIN") ? "loading" : "forbidden",
  });
  const [simulationWalletSummary, setSimulationWalletSummary] =
    useState<SimulationWalletMetricState>({
      status: adminCurrentUser.permissions.includes("SIMULATION_ADMIN") ? "loading" : "forbidden",
    });
  const canReadRag = adminCurrentUser.permissions.includes("RAG_ADMIN");
  const canManageChat = adminCurrentUser.permissions.includes("CHAT_ADMIN");
  const canManageVote = adminCurrentUser.permissions.includes("VOTE_ADMIN");
  const canManageSimulation = adminCurrentUser.permissions.includes("SIMULATION_ADMIN");

  useEffect(() => {
    if (screen.id !== "A-HOME-001") return;
    if (canReadRag) void loadRagJobSummary().then(setRagJobSummary);
    if (canManageChat) void loadChatRequestSummary().then(setChatRequestSummary);
    if (canManageChat) void loadActiveRoomSummary().then(setActiveRoomSummary);
    if (canManageVote) {
      void loadTaskActivitySummary().then(({ active, dueSoon, dueSoonItems, upcomingItems }) => {
        setActiveTaskSummary(active);
        setDueSoonTaskSummary(dueSoon);
        setDueSoonTasks(dueSoonItems);
        setUpcomingTasks(upcomingItems);
      });
    }
    if (canManageSimulation) void loadAttentionSimulations().then(setAttentionSimulations);
    if (canManageSimulation) void loadSimulationWalletSummary().then(setSimulationWalletSummary);
  }, [canManageChat, canManageSimulation, canManageVote, canReadRag, screen.id]);

  if (screen.id.startsWith("A-USER")) {
    return (
      <ScreenFrame screen={screen}>
        <AdminUserWorkspace screen={screen} />
      </ScreenFrame>
    );
  }

  return (
    <ScreenFrame screen={screen}>
      {screen.id === "A-HOME-001" ? (
        <AdminHome
          activeRoomSummary={activeRoomSummary}
          activeTaskSummary={activeTaskSummary}
          attentionSimulations={attentionSimulations}
          canManageSimulation={canManageSimulation}
          canReadRag={canReadRag}
          chatRequestSummary={chatRequestSummary}
          dueSoonTaskSummary={dueSoonTaskSummary}
          dueSoonTasks={dueSoonTasks}
          upcomingTasks={upcomingTasks}
          ragJobSummary={ragJobSummary}
          simulationWalletSummary={simulationWalletSummary}
        />
      ) : null}
    </ScreenFrame>
  );
}

export function AdminHome({
  activeRoomSummary,
  activeTaskSummary,
  attentionSimulations,
  canManageSimulation,
  canReadRag,
  ragJobSummary,
  chatRequestSummary,
  dueSoonTaskSummary,
  dueSoonTasks,
  upcomingTasks,
  simulationWalletSummary,
}: {
  activeRoomSummary: AdminDomainMetricState;
  activeTaskSummary: AdminDomainMetricState;
  attentionSimulations: HomeAttentionSimulationState;
  canManageSimulation: boolean;
  canReadRag: boolean;
  ragJobSummary: RagJobSummaryState;
  chatRequestSummary: ChatRequestSummaryState;
  dueSoonTaskSummary: AdminDomainMetricState;
  dueSoonTasks: readonly HomeTaskDeadline[];
  upcomingTasks: readonly Readonly<{ taskId: string; title: string; opensAt: string }>[];
  simulationWalletSummary: SimulationWalletMetricState;
}) {
  const failures = ragJobSummary.status === "ready" ? ragJobSummary.recentFailures : [];
  const attentionItems = attentionSimulations.status === "ready" ? attentionSimulations.items : [];
  return (
    <div className="civic-admin-home" data-wireflow-layout="admin-home">
      <ConsoleMetricStrip
        ariaLabel="관리 현황"
        metrics={[
          {
            label: "토론방 승인 대기",
            value: metricCount(chatRequestSummary),
            href: "/admin/chat/requests" as Route,
          },
          {
            label: "운영 중 토론방",
            value: metricCount(activeRoomSummary),
            href: "/admin/chat" as Route,
          },
          {
            label: "문서 처리 실패",
            value:
              ragJobSummary.status === "ready"
                ? `${ragJobSummary.failed}건`
                : ragJobSummary.status === "unavailable"
                  ? "확인 불가"
                  : "확인 중",
            href: "/admin/rag" as Route,
            ...(ragJobSummary.status === "ready"
              ? { description: `처리 중 ${ragJobSummary.active}건` }
              : {}),
          },
          {
            label: "진행 중 과업",
            value: metricCount(activeTaskSummary),
            href: "/admin/tasks" as Route,
          },
          {
            label: "24시간 내 마감",
            value: metricCount(dueSoonTaskSummary),
            href: "/admin/tasks" as Route,
          },
          {
            label: "시뮬레이션 사용 잔액",
            value: simulationWalletBalance(simulationWalletSummary),
            href: "/admin/simulations" as Route,
            ...(simulationWalletSummary.status === "ready"
              ? {
                  description: `오늘 사용 ${formatKrw(simulationWalletSummary.wallet.spentTodayKrw)}`,
                }
              : {}),
          },
        ]}
      />
      <div className="civic-home-columns">
        <AdminPendingChatRequests state={chatRequestSummary} />
        {dueSoonTasks.length > 0 ? (
          <HomeSection
            action={
              <Link className="civic-home-section-action" href="/admin/tasks">
                과업 관리
              </Link>
            }
            title="마감 임박 과업"
          >
            {dueSoonTasks.map((task) => (
              <HomeRow
                action={
                  <Link
                    href={`/admin/tasks/detail?taskId=${encodeURIComponent(task.taskId)}` as Route}
                  >
                    과업 보기
                  </Link>
                }
                key={task.taskId}
                meta={`마감 ${formatAdminDate(task.closesAt)}`}
                title={task.title}
              />
            ))}
          </HomeSection>
        ) : null}
        {upcomingTasks.length > 0 ? (
          <HomeSection
            action={
              <Link className="civic-home-section-action" href="/admin/tasks">
                과업 관리
              </Link>
            }
            title="시작 예정 과업"
          >
            {upcomingTasks.map((task) => (
              <HomeRow
                action={
                  <Link
                    href={`/admin/tasks/detail?taskId=${encodeURIComponent(task.taskId)}` as Route}
                  >
                    과업 보기
                  </Link>
                }
                key={task.taskId}
                meta={`시작 ${formatAdminDate(task.opensAt)}`}
                title={task.title}
              />
            ))}
          </HomeSection>
        ) : null}
        {failures.length > 0 ? (
          <HomeSection
            action={
              <Link className="civic-home-section-action" href="/admin/rag">
                문서 관리
              </Link>
            }
            title="처리 실패 문서"
          >
            {failures.slice(0, 3).map((failure) => (
              <HomeRow
                action={<Link href={ragFailureRetryHref(failure)}>재시도</Link>}
                key={failure.jobId}
                meta={ragFailureLabel(failure.failureCode)}
                title={failure.filename}
              />
            ))}
          </HomeSection>
        ) : null}
        {attentionItems.length > 0 ? (
          <HomeSection
            action={
              <Link
                className="civic-home-section-action civic-home-section-action--dark"
                href="/admin/simulations"
              >
                전체 보기
              </Link>
            }
            countLabel={`${attentionSimulations.status === "ready" ? attentionSimulations.count : attentionItems.length}건`}
            title="확인 필요 시뮬레이션"
          >
            {attentionItems.map((item) => (
              <HomeRow
                action={<Link href={item.href as Route}>상태 확인</Link>}
                key={item.taskId}
                meta={item.stateLabel}
                title={item.title}
              />
            ))}
          </HomeSection>
        ) : null}
        <AdminCurrentOperations canManageSimulation={canManageSimulation} canReadRag={canReadRag} />
      </div>
    </div>
  );
}

export function pendingAgeLabel(requestedAt: string, now = Date.now()): string {
  const timestamp = Date.parse(requestedAt);
  if (!Number.isFinite(timestamp)) return "";
  const days = Math.floor((now - timestamp) / (24 * 60 * 60 * 1_000));
  return days >= 2 ? ` · ${days}일째 대기` : "";
}

export function formatAdminHomeDate(value?: string | null, now = new Date()): string {
  if (!value) return formatAdminDate(value);
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return formatAdminDate(value);

  const yearFormatter = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    timeZone: "Asia/Seoul",
  });
  if (yearFormatter.format(date) !== yearFormatter.format(now)) return formatAdminDate(value);

  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(date);
}

function HomeSection({
  title,
  action,
  children,
  countLabel,
}: Readonly<{ title: string; action?: ReactNode; children: ReactNode; countLabel?: string }>) {
  return (
    <section aria-label={title} className="civic-home-section">
      <header className="civic-home-section-header">
        <h2>
          {title}
          {countLabel ? <span className="civic-home-section-count">{countLabel}</span> : null}
        </h2>
        {action ?? null}
      </header>
      <ul className="civic-home-list">{children}</ul>
    </section>
  );
}

function HomeRow({
  title,
  meta,
  action,
}: Readonly<{ title: string; meta: string; action?: ReactNode }>) {
  return (
    <li className="civic-home-row">
      <div className="civic-home-row-copy">
        <strong>{title}</strong>
        <small>{meta}</small>
      </div>
      {action ?? null}
    </li>
  );
}

export function AdminPendingChatRequests({ state }: Readonly<{ state: ChatRequestSummaryState }>) {
  const items = state.status === "ready" ? state.items : [];

  return (
    <section aria-labelledby="civic-pending-chat-requests-title" className="civic-home-section">
      <header className="civic-home-section-header">
        <h2 id="civic-pending-chat-requests-title">
          토론방 승인 대기
          {state.status === "ready" ? (
            <span className="civic-home-section-count">{metricCount(state)}</span>
          ) : null}
        </h2>
        {state.status !== "forbidden" ? (
          <Link
            className="civic-home-section-action civic-home-section-action--dark"
            href="/admin/chat/requests"
          >
            전체 보기
          </Link>
        ) : null}
      </header>
      {state.status === "loading" ? (
        <p aria-live="polite" className="civic-home-empty" role="status">
          승인 대기 목록을 확인하고 있습니다.
        </p>
      ) : null}
      {state.status === "forbidden" ? (
        <p className="civic-home-empty">
          채팅 관리 권한이 있는 관리자만 승인 대기 목록을 확인할 수 있습니다.
        </p>
      ) : null}
      {state.status === "unavailable" ? (
        <p aria-live="polite" className="civic-home-empty" role="status">
          승인 대기 목록을 불러오지 못했습니다. 전체 목록에서 다시 확인해 주세요.
        </p>
      ) : null}
      {state.status === "ready" && items.length === 0 ? (
        <p aria-live="polite" className="civic-home-empty" role="status">
          승인 대기 중인 토론방이 없습니다.
        </p>
      ) : null}
      {state.status === "ready" && items.length > 0 ? (
        <ul className="civic-home-list">
          {items.map((item) => (
            <li className="civic-home-row" key={item.creationRequestId}>
              <div className="civic-home-row-copy">
                <strong>{item.name}</strong>
                <small>
                  {adminUserLabel(state.labels, item.requesterUserId)} ·{" "}
                  {formatAdminHomeDate(item.requestedAt)}
                  {pendingAgeLabel(item.requestedAt)}
                </small>
              </div>
              <Link
                aria-label={`${item.name} 검토하기`}
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
        <p className="civic-home-empty">
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
              aria-label={`${failure.filename} 재시도`}
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
      items: page.items.slice(0, 3),
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

export async function loadTaskActivitySummary(
  request: typeof fetch = authenticatedFetch,
  now = Date.now(),
): Promise<HomeTaskActivityState> {
  const unavailable: HomeTaskActivityState = {
    active: { status: "unavailable" },
    dueSoon: { status: "unavailable" },
    dueSoonItems: [],
    upcomingItems: [],
  };
  try {
    const response = await request("/api/v1/admin/tasks", { cache: "no-store" });
    if (!response.ok) return unavailable;
    const tasks = readTaskSummaries(await response.json());
    if (!tasks) return unavailable;
    const deadline = now + 24 * 60 * 60 * 1_000;
    const open = tasks.filter((task) => task.status === "OPEN");
    const dueSoonItems = open
      .flatMap((task) => {
        const closesAt = task.schedule?.closesAt;
        if (!closesAt) return [];
        const timestamp = Date.parse(closesAt);
        if (!Number.isFinite(timestamp) || timestamp <= now || timestamp > deadline) return [];
        return [{ taskId: task.taskId, title: task.title, closesAt }];
      })
      .toSorted((left, right) => left.closesAt.localeCompare(right.closesAt))
      .slice(0, 3);
    const dueSoonCount = open.filter((task) => {
      const closesAt = task.schedule?.closesAt;
      if (!closesAt) return false;
      const timestamp = Date.parse(closesAt);
      return Number.isFinite(timestamp) && timestamp > now && timestamp <= deadline;
    }).length;
    const upcomingItems = tasks
      .flatMap((task) => {
        if (task.status !== "SCHEDULED") return [];
        const opensAt = task.schedule?.opensAt;
        if (!opensAt) return [];
        const timestamp = Date.parse(opensAt);
        if (!Number.isFinite(timestamp) || timestamp <= now || timestamp > deadline) return [];
        return [{ taskId: task.taskId, title: task.title, opensAt }];
      })
      .toSorted((left, right) => left.opensAt.localeCompare(right.opensAt))
      .slice(0, 3);
    return {
      active: { status: "ready", count: open.length, hasMore: false },
      dueSoon: { status: "ready", count: dueSoonCount, hasMore: false },
      dueSoonItems,
      upcomingItems,
    };
  } catch {
    return unavailable;
  }
}

export async function loadAttentionSimulations(
  request: typeof fetch = authenticatedFetch,
): Promise<HomeAttentionSimulationState> {
  try {
    const response = await request("/api/v1/admin/simulation-tasks", { cache: "no-store" });
    if (response.status === 401 || response.status === 403) return { status: "forbidden" };
    if (!response.ok) return { status: "unavailable" };
    const tasks = readSimulationTaskSummaries(await response.json());
    if (!tasks) return { status: "unavailable" };
    const attentionItems = tasks.flatMap((task): readonly HomeAttentionSimulation[] => {
      const latest = task.latestSimulation;
      if (!latest) return [];
      const presentation = simulationTargetPresentation(latest.state);
      if (presentation.tone !== "attention") return [];
      return [
        {
          taskId: task.taskId,
          title: task.title,
          stateLabel: presentation.label,
          href: simulationTargetHref(task.taskId, latest),
        },
      ];
    });
    return {
      status: "ready",
      count: attentionItems.length,
      items: attentionItems.slice(0, 3),
    };
  } catch {
    return { status: "unavailable" };
  }
}

export async function loadActiveRoomSummary(
  request: typeof fetch = authenticatedFetch,
): Promise<AdminDomainMetricState> {
  try {
    const response = await request("/api/v1/admin/rooms?status=ACTIVE&limit=50", {
      cache: "no-store",
    });
    if (response.status === 401 || response.status === 403) return { status: "forbidden" };
    if (!response.ok) return { status: "unavailable" };
    const value = (await response.json()) as { items?: unknown; hasNext?: unknown };
    if (!Array.isArray(value.items)) return { status: "unavailable" };
    return { status: "ready", count: value.items.length, hasMore: value.hasNext === true };
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

export function updateAdminLoadMessage(
  current: AdminLoadMessages,
  channel: keyof AdminLoadMessages,
  message: string,
): AdminLoadMessages {
  return { ...current, [channel]: message };
}

function metricCount(summary: AdminDomainMetricState | ChatRequestSummaryState): string {
  if (summary.status === "ready") return `${summary.count}건${summary.hasMore ? " 이상" : ""}`;
  if (summary.status === "forbidden") return "권한 없음";
  return summary.status === "loading" ? "확인 중" : "확인 불가";
}

function simulationWalletBalance(summary: SimulationWalletMetricState): string {
  if (summary.status === "ready") return formatKrw(summary.wallet.availableKrw);
  if (summary.status === "forbidden") return "권한 없음";
  return summary.status === "loading" ? "확인 중" : "확인 불가";
}
