"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  readSimulationTaskSummaries,
  simulationTargetHref,
  simulationTargetPresentation,
  type SimulationState,
} from "@/lib/admin/simulation-contracts";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";

const CURRENT_OPERATION_LIMIT = 6;
const CURRENT_OPERATION_POLL_MS = 10_000;
const ACTIVE_RAG_STATES = new Set(["PENDING", "PROCESSING", "QUEUED", "RUNNING", "RETRY_WAIT"]);

type OperationKind = "document" | "simulation";

export type AdminCurrentOperation = Readonly<{
  href: string;
  id: string;
  kind: OperationKind;
  meta: string;
  progressPercent: number | null;
  sortTimestamp: number;
  stage: string;
  title: string;
}>;

export type AdminCurrentOperationsState =
  | { status: "loading" }
  | {
      status: "ready";
      items: readonly AdminCurrentOperation[];
      total: number;
      unavailableSources: readonly string[];
    };

type OperationSourceResult =
  | {
      status: "ready";
      items: readonly AdminCurrentOperation[];
      total: number;
      warning: boolean;
    }
  | { status: "unavailable" };

export function AdminCurrentOperations({
  canManageSimulation,
  canReadRag,
}: Readonly<{ canManageSimulation: boolean; canReadRag: boolean }>) {
  const [state, setState] = useState<AdminCurrentOperationsState>({ status: "loading" });
  const enabled = canManageSimulation || canReadRag;

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let inFlight = false;

    const refresh = async () => {
      if (inFlight || document.hidden) return;
      inFlight = true;
      try {
        const next = await loadAdminCurrentOperations({ canManageSimulation, canReadRag });
        if (!disposed) setState(next);
      } finally {
        inFlight = false;
      }
    };
    const onVisibilityChange = () => {
      if (!document.hidden) void refresh();
    };
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), CURRENT_OPERATION_POLL_MS);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      disposed = true;
      window.clearTimeout(initial);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [canManageSimulation, canReadRag, enabled]);

  if (!enabled) return null;
  return <AdminCurrentOperationsView state={state} />;
}

export function AdminCurrentOperationsView({
  state,
}: Readonly<{ state: AdminCurrentOperationsState }>) {
  const items = state.status === "ready" ? state.items : [];
  const unavailableSources = state.status === "ready" ? state.unavailableSources : [];

  return (
    <section aria-labelledby="civic-current-operations-title" className="civic-current-operations">
      <header>
        <div>
          <small>실시간 운영</small>
          <h2 id="civic-current-operations-title">현재 처리 중</h2>
        </div>
        <strong>
          {state.status === "ready"
            ? `${state.total.toLocaleString("ko-KR")}건${unavailableSources.length > 0 ? " 이상" : ""}`
            : "확인 중"}
        </strong>
      </header>
      {state.status === "loading" ? (
        <p aria-live="polite" className="civic-current-operations-empty" role="status">
          처리 현황을 확인하고 있습니다.
        </p>
      ) : null}
      {state.status === "ready" && items.length > 0 ? (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <span className={`civic-operation-kind is-${item.kind}`}>
                {item.kind === "simulation" ? "시뮬레이션" : "문서 처리"}
              </span>
              <div className="civic-operation-copy">
                <strong>{item.title}</strong>
                <span>
                  {item.stage} · {item.meta}
                </span>
              </div>
              <div className="civic-operation-progress">
                <span>
                  {item.progressPercent === null ? "진행률 확인 중" : `${item.progressPercent}%`}
                </span>
                <progress
                  aria-label={`${item.title} 진행률`}
                  max={100}
                  {...(item.progressPercent === null ? {} : { value: item.progressPercent })}
                />
              </div>
              <Link
                aria-label={`${item.title} 처리 상세보기`}
                className="wf-button wf-button-secondary"
                href={item.href as Route}
              >
                상세보기
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {state.status === "ready" && !items.length ? (
        <p aria-live="polite" className="civic-current-operations-empty" role="status">
          {unavailableSources.length > 0
            ? "일부 처리 현황을 불러오지 못했습니다. 현재 확인된 진행 작업은 없습니다."
            : "현재 처리 중인 작업이 없습니다."}
        </p>
      ) : null}
      {state.status === "ready" && unavailableSources.length > 0 && items.length > 0 ? (
        <p aria-live="polite" className="civic-current-operations-warning" role="status">
          {unavailableSources.join("·")} 처리 현황은 불러오지 못했습니다. 표시된 항목은 정상적으로
          갱신됩니다.
        </p>
      ) : null}
    </section>
  );
}

export async function loadAdminCurrentOperations({
  canManageSimulation,
  canReadRag,
  request = authenticatedFetch,
}: Readonly<{
  canManageSimulation: boolean;
  canReadRag: boolean;
  request?: typeof fetch;
}>): Promise<Extract<AdminCurrentOperationsState, { status: "ready" }>> {
  const [rag, simulation] = await Promise.all([
    canReadRag ? loadCurrentRagOperations(request) : Promise.resolve(null),
    canManageSimulation ? loadCurrentSimulationOperations(request) : Promise.resolve(null),
  ]);
  const unavailableSources: string[] = [];
  const items: AdminCurrentOperation[] = [];
  let total = 0;

  collectSource("문서", rag, unavailableSources, items, (count) => (total += count));
  collectSource("시뮬레이션", simulation, unavailableSources, items, (count) => (total += count));

  return {
    status: "ready",
    items: items
      .toSorted((left, right) => right.sortTimestamp - left.sortTimestamp)
      .slice(0, CURRENT_OPERATION_LIMIT),
    total,
    unavailableSources,
  };
}

function collectSource(
  label: string,
  source: OperationSourceResult | null,
  unavailableSources: string[],
  items: AdminCurrentOperation[],
  addTotal: (count: number) => void,
) {
  if (source === null) return;
  if (source.status === "unavailable") {
    unavailableSources.push(label);
    return;
  }
  items.push(...source.items);
  addTotal(source.total);
  if (source.warning) unavailableSources.push(`${label} 일부`);
}

async function loadCurrentSimulationOperations(
  request: typeof fetch,
): Promise<OperationSourceResult> {
  try {
    const response = await request("/api/v1/admin/simulation-tasks", { cache: "no-store" });
    if (!response.ok) return { status: "unavailable" };
    const tasks = readSimulationTaskSummaries(await response.json());
    if (!tasks) return { status: "unavailable" };
    const items = tasks.flatMap((task): readonly AdminCurrentOperation[] => {
      const latest = task.latestSimulation;
      if (!latest || simulationTargetPresentation(latest.state).tone !== "running") return [];
      return [
        {
          href: simulationTargetHref(task.taskId, latest),
          id: `simulation:${latest.simulationId}`,
          kind: "simulation",
          meta: simulationOperationMeta(latest.personaCount, latest.estimatedCompletionAt),
          progressPercent: latest.progressPercent,
          sortTimestamp: validTimestamp(latest.startedAt ?? latest.createdAt),
          stage: activeSimulationStateLabel(latest.state),
          title: task.title,
        },
      ];
    });
    return { status: "ready", items, total: items.length, warning: false };
  } catch {
    return { status: "unavailable" };
  }
}

async function loadCurrentRagOperations(request: typeof fetch): Promise<OperationSourceResult> {
  try {
    const foldersResponse = await request("/api/v1/rag/folders", { cache: "no-store" });
    if (!foldersResponse.ok) return { status: "unavailable" };
    const foldersValue = (await foldersResponse.json()) as { items?: unknown };
    if (!Array.isArray(foldersValue.items)) return { status: "unavailable" };
    const root = foldersValue.items.find(isRootFolder);
    if (!root) return { status: "unavailable" };

    const responses = await Promise.all(
      ["PENDING", "PROCESSING"].map((status) =>
        request(currentRagDocumentPath(root.folder_id, status), { cache: "no-store" }),
      ),
    );
    const pages = await Promise.all(
      responses.map(async (response) =>
        response.ok ? readRagOperationPage(await response.json()) : null,
      ),
    );
    const availablePages = pages.filter((page) => page !== null);
    if (!availablePages.length) return { status: "unavailable" };

    const itemsById = new Map<string, AdminCurrentOperation>();
    for (const page of availablePages) {
      for (const item of page.items) itemsById.set(item.id, item);
    }
    return {
      status: "ready",
      items: [...itemsById.values()],
      total: availablePages.reduce((sum, page) => sum + page.total, 0),
      warning: availablePages.length !== pages.length,
    };
  } catch {
    return { status: "unavailable" };
  }
}

function isRootFolder(value: unknown): value is { folder_id: string } {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return record.kind === "ROOT" && typeof record.folder_id === "string";
}

function currentRagDocumentPath(folderId: string, status: string): string {
  const parameters = new URLSearchParams({
    folder_id: folderId,
    include_subfolders: "true",
    page: "1",
    page_size: "25",
    status,
    sort: "created_at",
    direction: "desc",
  });
  return `/api/v1/rag/documents?${parameters.toString()}`;
}

function readRagOperationPage(
  value: unknown,
): Readonly<{ items: readonly AdminCurrentOperation[]; total: number }> | null {
  if (!value || typeof value !== "object") return null;
  const page = value as Record<string, unknown>;
  if (!Array.isArray(page.items)) return null;
  const items = page.items.flatMap(readRagOperation);
  const total =
    typeof page.total === "number" && Number.isSafeInteger(page.total) && page.total >= 0
      ? page.total
      : items.length;
  return { items, total };
}

function readRagOperation(value: unknown): readonly AdminCurrentOperation[] {
  if (!value || typeof value !== "object") return [];
  const document = value as Record<string, unknown>;
  if (
    typeof document.document_id !== "string" ||
    typeof document.folder_id !== "string" ||
    typeof document.filename !== "string" ||
    !document.active_version ||
    typeof document.active_version !== "object"
  ) {
    return [];
  }
  const version = document.active_version as Record<string, unknown>;
  const processing =
    version.processing && typeof version.processing === "object"
      ? (version.processing as Record<string, unknown>)
      : undefined;
  const state =
    typeof processing?.status === "string"
      ? processing.status
      : typeof version.status === "string"
        ? version.status
        : "";
  if (!ACTIVE_RAG_STATES.has(state)) return [];
  const jobId = typeof version.job_id === "string" ? version.job_id : undefined;
  const progressPercent = safeProgressPercent(processing?.progress);
  return [
    {
      href: ragOperationHref(document.folder_id, document.filename, jobId),
      id: `document:${document.document_id}`,
      kind: "document",
      meta: "문서 변환·색인",
      progressPercent,
      sortTimestamp: validTimestamp(
        typeof document.updated_at === "string"
          ? document.updated_at
          : typeof document.created_at === "string"
            ? document.created_at
            : undefined,
      ),
      stage: activeRagStateLabel(state),
      title: document.filename,
    },
  ];
}

function ragOperationHref(folderId: string, filename: string, jobId?: string): string {
  if (!jobId) return `/admin/rag?folderId=${encodeURIComponent(folderId)}`;
  const parameters = new URLSearchParams({ jobId, filename, folderId });
  return `/admin/rag/jobs?${parameters.toString()}`;
}

function safeProgressPercent(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(100, Math.round(value)))
    : null;
}

function validTimestamp(value: string | null | undefined): number {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function activeSimulationStateLabel(state: SimulationState): string {
  return (
    (
      {
        READY: "실행 대기",
        RUNNING: "실행 중",
        WAITING_PROVIDER: "공급자 응답 대기",
        PUBLISHING: "결과 정리 중",
      } as Partial<Record<SimulationState, string>>
    )[state] ?? "진행 중"
  );
}

function activeRagStateLabel(state: string): string {
  return (
    (
      {
        PENDING: "처리 대기",
        PROCESSING: "처리 중",
        QUEUED: "처리 대기",
        RUNNING: "처리 중",
        RETRY_WAIT: "재시도 대기",
      } as Record<string, string>
    )[state] ?? "처리 중"
  );
}

function simulationOperationMeta(
  personaCount: number,
  estimatedCompletionAt: string | null,
): string {
  const count = `가상 패널 ${personaCount.toLocaleString("ko-KR")}명`;
  if (!estimatedCompletionAt) return count;
  const timestamp = Date.parse(estimatedCompletionAt);
  if (!Number.isFinite(timestamp)) return count;
  const time = new Intl.DateTimeFormat("ko-KR", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(timestamp);
  return `${count} · 완료 예상 ${time}`;
}
