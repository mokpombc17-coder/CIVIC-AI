"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  readSimulationScenarios,
  readSimulationTaskSummaries,
  simulationTargetHref,
  simulationTargetPresentation,
  type SimulationState,
  type SimulationView,
} from "@/lib/admin/simulation-contracts";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";
import { readTaskDetail, readTaskSummaries, type TaskDetail } from "@/lib/admin/domain-contracts";
import { taskPreparationPresentation } from "@/lib/admin/task-preparation";
import { TASK_PREPARATION_DELAY_MS, elapsedLabel, parseTimestamp } from "@/lib/admin/elapsed";

const CURRENT_OPERATION_LIMIT = 6;
const CURRENT_OPERATION_POLL_MS = 10_000;
const TASK_PREPARATION_SCAN_TIMEOUT_MS = 8_000;
const ACTIVE_RAG_STATES = new Set(["PENDING", "PROCESSING", "QUEUED", "RUNNING", "RETRY_WAIT"]);

type OperationKind = "document" | "simulation" | "prediction";

export type AdminCurrentOperation = Readonly<{
  href: string;
  id: string;
  kind: OperationKind;
  meta: string;
  progressPercent: number | null;
  sortTimestamp: number;
  stage: string;
  // 운영자가 바로 조치해야 하는 항목(생성 실패·지연)이다.
  attention?: boolean;
  // 투표 AI 예상 답변 생성이 실패(재시도 필요·내용 확인 필요)한 항목이다.
  failed?: boolean;
  title: string;
}>;

export type AdminCurrentOperationsState =
  | { status: "loading" }
  | {
      status: "ready";
      items: readonly AdminCurrentOperation[];
      // 표시 개수 제한과 무관하게 조치가 필요한 투표 AI 생성 실패 전체.
      preparationFailures: readonly AdminCurrentOperation[];
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

export function useAdminCurrentOperations({
  canManageSimulation,
  canReadRag,
  canManageVote = false,
}: Readonly<{
  canManageSimulation: boolean;
  canReadRag: boolean;
  canManageVote?: boolean;
}>): AdminCurrentOperationsState | null {
  const [state, setState] = useState<AdminCurrentOperationsState>({ status: "loading" });
  const enabled = canManageSimulation || canReadRag || canManageVote;

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let inFlight = false;
    let controller: AbortController | null = null;

    const refresh = async () => {
      if (inFlight || document.hidden) return;
      inFlight = true;
      const currentController = new AbortController();
      controller = currentController;
      try {
        const next = await loadAdminCurrentOperations({
          canManageSimulation,
          canReadRag,
          canManageVote,
          signal: currentController.signal,
        });
        if (!disposed && !currentController.signal.aborted) setState(next);
      } finally {
        inFlight = false;
      }
    };
    const onVisibilityChange = () => {
      if (document.hidden) controller?.abort();
      else void refresh();
    };
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), CURRENT_OPERATION_POLL_MS);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      disposed = true;
      controller?.abort();
      window.clearTimeout(initial);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [canManageSimulation, canReadRag, canManageVote, enabled]);

  return enabled ? state : null;
}

export function AdminCurrentOperations({
  state,
}: Readonly<{ state: AdminCurrentOperationsState | null }>) {
  // 조회 실패를 작업 없음으로 오해하지 않도록 경고는 유지한다.
  if (!state || state.status !== "ready" || (state.total === 0 && !state.unavailableSources.length))
    return null;
  return <AdminCurrentOperationsView state={state} />;
}

export function AdminPreparationAlert({
  state,
}: Readonly<{ state: AdminCurrentOperationsState | null }>) {
  const failures = state?.status === "ready" ? state.preparationFailures : [];
  if (failures.length === 0) return null;
  return (
    <section
      aria-labelledby="civic-preparation-alert-title"
      className="civic-preparation-alert"
      role="alert"
    >
      <header>
        <strong id="civic-preparation-alert-title">
          AI 예상 답변 생성에 실패한 투표가 {failures.length.toLocaleString("ko-KR")}건 있습니다.
        </strong>
        <p>투표를 발행하려면 오류 원인을 확인한 뒤 다시 생성해 주세요.</p>
      </header>
      <ul>
        {failures.map((item) => (
          <li key={item.id}>
            <div>
              <strong>{item.title}</strong>
              <span>
                {item.stage} · {item.meta}
              </span>
            </div>
            <Link
              aria-label={`${item.title} AI 예상 답변 확인`}
              className="wf-button wf-button-secondary"
              href={item.href as Route}
            >
              확인하기
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
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
                {item.kind === "prediction"
                  ? "투표 AI"
                  : item.kind === "simulation"
                    ? "시뮬레이션"
                    : "문서 처리"}
              </span>
              <div className="civic-operation-copy">
                <strong>{item.title}</strong>
                <span>
                  {item.stage} · {item.meta}
                </span>
              </div>
              <div className="civic-operation-progress">
                {item.kind === "prediction" ? (
                  <strong
                    className={`civic-preparation-badge${item.attention ? " is-attention" : ""}`}
                  >
                    {item.stage}
                  </strong>
                ) : (
                  <>
                    <span>
                      {item.progressPercent === null
                        ? "진행률 확인 중"
                        : `${item.progressPercent}%`}
                    </span>
                    <progress
                      aria-label={`${item.title} 진행률`}
                      max={100}
                      {...(item.progressPercent === null ? {} : { value: item.progressPercent })}
                    />
                  </>
                )}
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
  canManageVote = false,
  request = authenticatedFetch,
  signal,
  now = Date.now(),
}: Readonly<{
  canManageSimulation: boolean;
  canReadRag: boolean;
  canManageVote?: boolean;
  request?: typeof fetch;
  signal?: AbortSignal;
  now?: number;
}>): Promise<Extract<AdminCurrentOperationsState, { status: "ready" }>> {
  const [rag, simulation, prediction] = await Promise.all([
    canReadRag ? loadCurrentRagOperations(request) : Promise.resolve(null),
    canManageSimulation ? loadCurrentSimulationOperations(request) : Promise.resolve(null),
    canManageVote ? loadCurrentTaskPreparations(request, now, signal) : Promise.resolve(null),
  ]);
  const unavailableSources: string[] = [];
  const items: AdminCurrentOperation[] = [];
  let total = 0;

  collectSource("문서", rag, unavailableSources, items, (count) => (total += count));
  collectSource("시뮬레이션", simulation, unavailableSources, items, (count) => (total += count));
  collectSource("투표 AI", prediction, unavailableSources, items, (count) => (total += count));

  const sorted = items.toSorted(
    (left, right) =>
      Number(Boolean(right.attention)) - Number(Boolean(left.attention)) ||
      right.sortTimestamp - left.sortTimestamp,
  );
  return {
    status: "ready",
    items: sorted.slice(0, CURRENT_OPERATION_LIMIT),
    preparationFailures: sorted.filter((item) => item.failed),
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

type SimulationTarget = Readonly<{ id: string; title: string; latest: SimulationView | null }>;

// 투표 기반 실행과 직접 작성한 시뮬레이션 실행을 함께 보여준다. 한쪽만 실패하면 일부 누락으로 알린다.
async function loadCurrentSimulationOperations(
  request: typeof fetch,
): Promise<OperationSourceResult> {
  const [votes, scenarios] = await Promise.all([
    loadSimulationTargets(request, "/api/v1/admin/simulation-tasks", (value) =>
      readSimulationTaskSummaries(value)?.map((task) => ({
        id: task.taskId,
        title: task.title,
        latest: task.latestSimulation,
      })),
    ),
    loadSimulationTargets(request, "/api/v1/admin/simulation-scenarios", (value) =>
      readSimulationScenarios(value)?.map((scenario) => ({
        id: scenario.scenarioId,
        title: scenario.title,
        latest: scenario.latestSimulation,
      })),
    ),
  ]);
  if (!votes && !scenarios) return { status: "unavailable" };
  const items = [...(votes ?? []), ...(scenarios ?? [])].flatMap(
    ({ id, title, latest }): readonly AdminCurrentOperation[] => {
      if (latest?.state === "REVIEW_REQUIRED") {
        // 일부 페르소나 응답이 실패한 실행은 관리자가 처리해야 하므로 확인 필요로 앞에 둔다.
        return [
          {
            href: simulationTargetHref(id, latest),
            id: `simulation:${latest.simulationId}`,
            kind: "simulation",
            meta: "일부 페르소나 응답 실패",
            attention: true,
            progressPercent: null,
            sortTimestamp: validTimestamp(latest.startedAt ?? latest.createdAt),
            stage: "확인 필요",
            title,
          },
        ];
      }
      if (!latest || simulationTargetPresentation(latest.state).tone !== "running") return [];
      return [
        {
          href: simulationTargetHref(id, latest),
          id: `simulation:${latest.simulationId}`,
          kind: "simulation",
          meta: simulationOperationMeta(latest.personaCount, latest.estimatedCompletionAt),
          progressPercent: latest.progressPercent,
          sortTimestamp: validTimestamp(latest.startedAt ?? latest.createdAt),
          stage: activeSimulationStateLabel(latest.state),
          title,
        },
      ];
    },
  );
  return { status: "ready", items, total: items.length, warning: !votes || !scenarios };
}

async function loadSimulationTargets(
  request: typeof fetch,
  path: string,
  read: (value: unknown) => readonly SimulationTarget[] | undefined,
): Promise<readonly SimulationTarget[] | null> {
  try {
    const response = await request(path, { cache: "no-store" });
    if (!response.ok) return null;
    return read(await response.json()) ?? null;
  } catch {
    return null;
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

export function taskPreparationOperation(
  detail: TaskDetail,
  now: number,
): AdminCurrentOperation | null {
  const preparation = detail.preparation;
  if (
    detail.task.status !== "DRAFT" ||
    !preparation ||
    !["PROCESSING", "FAILED", "REJECTED"].includes(preparation.status)
  )
    return null;
  const presentation = taskPreparationPresentation(preparation, detail.capabilities);
  const attempts = `${preparation.attemptCount.toLocaleString("ko-KR")}회 시도`;
  const updatedAt = parseTimestamp(preparation.updatedAt);
  let stage = presentation.label;
  let meta: string;
  let attention = true;
  if (preparation.status === "PROCESSING") {
    const startedAt = parseTimestamp(preparation.processingStartedAt) ?? updatedAt;
    const delayed = startedAt !== null && now - startedAt >= TASK_PREPARATION_DELAY_MS;
    stage = delayed ? "생성 지연" : presentation.label;
    attention = delayed;
    meta = `AI 예상 답변 · ${startedAt === null ? "경과 시간 확인 불가" : `${elapsedLabel(startedAt, now)} 경과`} · ${attempts}`;
  } else {
    meta = `AI 예상 답변 · ${updatedAt === null ? "실패 시각 확인 불가" : `실패 후 ${elapsedLabel(updatedAt, now)}`} · ${attempts}`;
  }
  return {
    id: `prediction:${detail.task.id}`,
    kind: "prediction",
    href: `/admin/tasks/detail?taskId=${encodeURIComponent(detail.task.id)}`,
    title: detail.task.title,
    stage,
    meta,
    attention,
    failed: preparation.status !== "PROCESSING",
    progressPercent: null,
    sortTimestamp: validTimestamp(preparation.updatedAt),
  };
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
  const count = `페르소나 ${personaCount.toLocaleString("ko-KR")}명`;
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

// 목록 API에는 준비 상태가 없다. 발행 전 초안만 상세 조회하고 동시 요청 수를 제한한다.
async function loadCurrentTaskPreparations(
  request: typeof fetch,
  now: number,
  signal?: AbortSignal,
): Promise<OperationSourceResult> {
  const controller = new AbortController();
  const items: AdminCurrentOperation[] = [];
  const cancel = () => controller.abort();
  let onAbort: () => void = () => undefined;
  const aborted = new Promise<OperationSourceResult>((resolve) => {
    onAbort = () =>
      resolve({ status: "ready", items: [...items], total: items.length, warning: true });
    controller.signal.addEventListener("abort", onAbort, { once: true });
  });
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  const timer = setTimeout(cancel, TASK_PREPARATION_SCAN_TIMEOUT_MS);
  try {
    // 인증 갱신처럼 fetch 자체의 취소와 별개인 대기도 전체 현황을 막지 않는다.
    return await Promise.race([
      scanCurrentTaskPreparations(request, now, controller.signal, items),
      aborted,
    ]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
    controller.signal.removeEventListener("abort", onAbort);
  }
}

async function scanCurrentTaskPreparations(
  request: typeof fetch,
  now: number,
  signal: AbortSignal,
  items: AdminCurrentOperation[],
): Promise<OperationSourceResult> {
  try {
    signal?.throwIfAborted();
    const response = await request("/api/v1/admin/tasks", {
      cache: "no-store",
      ...(signal ? { signal } : {}),
    });
    if (!response.ok) return { status: "unavailable" };
    const tasks = readTaskSummaries(await response.json());
    signal.throwIfAborted();
    if (!tasks) return { status: "unavailable" };
    const drafts = tasks.filter((task) => task.status === "DRAFT");
    let nextIndex = 0;
    let warning = false;
    await Promise.all(
      Array.from({ length: Math.min(4, drafts.length) }, async () => {
        while (nextIndex < drafts.length && !signal?.aborted) {
          const task = drafts[nextIndex++];
          if (!task) return;
          try {
            const detailResponse = await request(
              `/api/v1/admin/tasks/${encodeURIComponent(task.taskId)}`,
              { cache: "no-store", ...(signal ? { signal } : {}) },
            );
            const detail = detailResponse.ok ? readTaskDetail(await detailResponse.json()) : null;
            signal.throwIfAborted();
            if (!detail || detail.task.id !== task.taskId) {
              warning = true;
              continue;
            }
            const operation = taskPreparationOperation(detail, now);
            if (operation) items.push(operation);
          } catch {
            warning = true;
          }
        }
      }),
    );
    return { status: "ready", items, total: items.length, warning };
  } catch {
    return { status: "unavailable" };
  }
}
