"use client";

import { useEffect, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { AdminCurrentOperations } from "@/components/admin/admin-current-operations";
import { AdminUserWorkspace } from "@/components/admin/admin-user-workspace";
import type { ScreenDefinition } from "@/lib/screens/registry";
import { adminUserLabel, requestAdminUserLabels } from "@/lib/admin/user-labels";
import {
  readRoomCreationRequestPage,
  type RoomCreationRequest,
} from "@/lib/admin/domain-contracts";
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
    if (canManageVote) void loadActiveTaskSummary().then(setActiveTaskSummary);
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
          canManageSimulation={canManageSimulation}
          canReadRag={canReadRag}
          chatRequestSummary={chatRequestSummary}
          ragJobSummary={ragJobSummary}
          simulationWalletSummary={simulationWalletSummary}
          activeTaskSummary={activeTaskSummary}
        />
      ) : null}
    </ScreenFrame>
  );
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
          <small>토론방 승인 대기</small>
          <strong>{metricCount(chatRequestSummary)}</strong>
        </li>
        <li className="wf-admin-metric">
          <small>문서 처리 실패</small>
          <strong>
            {ragJobSummary.status === "ready"
              ? `${ragJobSummary.failed}건`
              : ragJobSummary.status === "unavailable"
                ? "확인 불가"
                : "확인 중"}
          </strong>
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
          <h2 id="civic-pending-chat-requests-title">토론방 승인 대기</h2>
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
          승인 대기 중인 토론방이 없습니다.
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
                  {formatAdminDate(item.requestedAt)}
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

function metricDescription(
  summary: AdminDomainMetricState | ChatRequestSummaryState,
  label: string,
): string {
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
