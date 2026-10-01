"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScreenFrame } from "@/components/screens/screen-frame";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import {
  ConsoleMetricStrip,
  ConsoleTabs,
  type ConsoleTabItem,
} from "@/components/admin/console/console-ui";
import { formatKrw } from "@/lib/admin/format";
import {
  loadSimulationTarget,
  SimulationScenarioEditor,
  SimulationLists,
  type SimulationTarget,
} from "@/components/admin/simulation-scenario-panels";
import {
  loadWalletMetricState,
  readSimulationSection,
  SimulationBillingSection,
  SimulationSectionTabs,
  walletMetricItems,
  type SimulationSection,
  type WalletMetricState,
} from "@/components/admin/simulation-billing-panels";
import {
  SIMULATION_RESPONSE_PAGE_SIZE,
  SimulationResultExplorer,
  type SimulationResponseFilters,
  type SimulationResponsesView,
  type SimulationResultComparison,
  type SimulationResultDimension,
} from "@/components/admin/simulation-result-explorer";
import { formatAdminProblem, readAdminProblem } from "@/lib/admin/domain-contracts";
import {
  readSimulationPreview,
  readWalletSummary,
  type SimulationPreview,
  type WalletSummary,
} from "@/lib/admin/simulation-billing-contracts";
import {
  isPersonaCountWithinLimit,
  readSimulationCapacity,
  readSimulationOptions,
  readSimulationResult,
  readSimulationResponsePage,
  readSimulationView,
  type SimulationCapacity,
  type SimulationOptions,
  type SimulationResult,
  type SimulationResponsePage,
  type SimulationState,
  type SimulationView,
} from "@/lib/admin/simulation-contracts";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";
import type { ScreenDefinition } from "@/lib/screens/registry";

type AdminQuery = Readonly<Record<string, string | readonly string[] | undefined>>;
export type RunInput = Readonly<{
  filters?: Readonly<Record<string, readonly string[]>>;
  modelType: string;
  personaCount: number;
  sampleSeed: number | null;
}>;
type CapacityInput = Pick<RunInput, "filters" | "personaCount" | "sampleSeed">;

export const ADMIN_SIMULATION_PATHS = {
  create: "/api/v1/admin/simulations",
  preview: "/api/v1/admin/simulations/preview",
} as const;

const SIMULATION_PERSONA_COUNT_MIN = 100;
const SIMULATION_PERSONA_COUNT_MAX = 800;

export function AdminSimulationScreen({
  screen,
  query,
}: Readonly<{ screen: ScreenDefinition; query: AdminQuery }>) {
  const taskId = first(query.taskId);
  const simulationId = first(query.simulationId);

  return (
    <ScreenFrame
      {...(screen.id === "A-SIM-001" ? {} : { backHref: "/admin/simulations" as Route })}
      screen={screen}
    >
      <div
        className="civic-admin-workbench civic-domain-console civic-simulation-console"
        data-wireflow-layout={simulationLayout(screen.id)}
      >
        {screen.id === "A-SIM-001" ? (
          <SimulationHub initialSection={readSimulationSection(first(query.section))} />
        ) : (
          <SimulationRunWorkspace
            query={query}
            screenId={screen.id}
            simulationId={simulationId}
            taskId={taskId}
          />
        )}
      </div>
    </ScreenFrame>
  );
}

function SimulationHub({ initialSection }: Readonly<{ initialSection: SimulationSection }>) {
  const [section, setSection] = useState<SimulationSection>(initialSection);
  const [walletState, setWalletState] = useState<WalletMetricState>({ status: "loading" });

  useEffect(() => {
    const timer = window.setTimeout(() => void loadWalletMetricState().then(setWalletState), 0);
    return () => window.clearTimeout(timer);
  }, []);

  function switchSection(next: SimulationSection) {
    setSection(next);
    syncSimulationSectionUrl(next);
  }

  return (
    <>
      <ConsoleMetricStrip ariaLabel="공용 지갑 요약" metrics={walletMetricItems(walletState)} />
      <SimulationSectionTabs active={section} onSelect={switchSection} />
      {section === "run" ? <SimulationLists /> : null}
      <SimulationBillingSection
        onWalletChange={(wallet) => setWalletState({ status: "ready", wallet })}
        section={section}
      />
    </>
  );
}

function syncSimulationSectionUrl(section: SimulationSection) {
  if (typeof window === "undefined") return;
  const path =
    section === "run"
      ? "/admin/simulations"
      : `/admin/simulations?section=${encodeURIComponent(section)}`;
  window.history.replaceState(window.history.state, "", path);
}

export type SimulationRunStage = "setup" | "status" | "results";

export function simulationRunStageForScreen(screenId: string): SimulationRunStage {
  if (screenId === "A-SIM-004" || screenId === "A-SIM-005") return "status";
  if (screenId === "A-SIM-006" || screenId === "A-SIM-007") return "results";
  return "setup";
}

export function simulationRunPath(
  stage: SimulationRunStage,
  taskId: string | null,
  simulationId: string | null,
): string {
  if (stage === "setup") {
    return taskId
      ? `/admin/simulations/setup?taskId=${encodeURIComponent(taskId)}`
      : "/admin/simulations/setup";
  }
  const base = stage === "status" ? "/admin/simulations/status" : "/admin/simulations/results";
  return simulationId ? `${base}?simulationId=${encodeURIComponent(simulationId)}` : base;
}

function syncSimulationRunUrl(
  stage: SimulationRunStage,
  taskId: string | null,
  simulationId: string | null,
) {
  if (typeof window === "undefined") return;
  window.history.replaceState(
    window.history.state,
    "",
    simulationRunPath(stage, taskId, simulationId),
  );
}

function SimulationRunWorkspace({
  query,
  screenId,
  simulationId,
  taskId,
}: Readonly<{
  query: AdminQuery;
  screenId: string;
  simulationId: string | null;
  taskId: string | null;
}>) {
  const [stage, setStage] = useState<SimulationRunStage>(() =>
    simulationRunStageForScreen(screenId),
  );
  const [viewTaskId, setViewTaskId] = useState<string | null>(null);
  const knownTaskId = taskId ?? viewTaskId;
  const reportView = useCallback((view: SimulationView) => setViewTaskId(view.taskId), []);

  const tabs: readonly ConsoleTabItem[] = [
    { id: "setup", label: "설정", disabled: !knownTaskId },
    { id: "status", label: "동작", disabled: !simulationId },
    { id: "results", label: "결과", disabled: !simulationId },
  ];

  function switchStage(next: SimulationRunStage) {
    setStage(next);
    syncSimulationRunUrl(next, knownTaskId, simulationId);
  }

  return (
    <>
      <ConsoleTabs
        activeId={stage}
        ariaLabel="시뮬레이션 실행 단계"
        onSelect={(id) => switchStage(id as SimulationRunStage)}
        tabs={tabs}
      />
      {stage === "setup" ? (
        <SimulationSetup
          defaultPanelOpen={screenId === "A-SIM-003"}
          query={query}
          taskId={knownTaskId}
        />
      ) : null}
      {stage === "status" ? (
        <SimulationStatus onView={reportView} simulationId={simulationId} />
      ) : null}
      {stage === "results" ? (
        <SimulationResults
          initialSlot={screenId === "A-SIM-007" ? positiveInteger(first(query.ordinal)) : null}
          simulationId={simulationId}
        />
      ) : null}
    </>
  );
}

export type SimulationStateTone = "neutral" | "active" | "danger" | "success";

function SimulationSetup({
  defaultPanelOpen = false,
  query,
  taskId,
}: Readonly<{ defaultPanelOpen?: boolean; query: AdminQuery; taskId: string | null }>) {
  const [target, setTarget] = useState<SimulationTarget | null>(null);
  const [options, setOptions] = useState<SimulationOptions | null>(null);
  const [personaCount, setPersonaCount] = useState(SIMULATION_PERSONA_COUNT_MIN);
  const [filters, setFilters] = useState<Record<string, readonly string[]>>({});
  const [panelOpen, setPanelOpen] = useState(defaultPanelOpen);
  const [message, setMessage] = useState("");
  const { pending, start, startMessage } = useStartSimulation(taskId);
  const requestedPersonaCount = positiveInteger(first(query.personaCount));
  const runInput = options ? buildDefaultSimulationRunInput(personaCount, options, filters) : null;
  const capacityState = useSimulationCapacity(
    options ? normalizeCapacityInput(personaCount, "", filters) : null,
  );
  const previewState = useSimulationPreview(taskId, runInput);

  useEffect(() => {
    if (!taskId) return;
    const timer = window.setTimeout(() => {
      void Promise.all([
        loadSimulationTarget(taskId),
        authenticatedFetch("/api/v1/admin/simulation-options", { cache: "no-store" }),
      ])
        .then(async ([nextTarget, optionsResponse]) => {
          if (!optionsResponse.ok)
            throw new Error(formatAdminProblem(await readAdminProblem(optionsResponse)));
          const nextOptions = readSimulationOptions(await optionsResponse.json());
          if (!nextOptions) throw new Error("서버 응답 형식을 확인해야 합니다.");
          setTarget(nextTarget);
          setOptions(nextOptions);
          const nextLimits = simulationPersonaCountLimits(nextOptions);
          setPersonaCount(
            requestedPersonaCount &&
              isPersonaCountWithinLimit(requestedPersonaCount, nextLimits.min, nextLimits.max)
              ? requestedPersonaCount
              : nextLimits.min,
          );
          setFilters({ regions: nextOptions.filters.regions });
          setMessage("");
        })
        .catch((error: unknown) =>
          setMessage(error instanceof Error ? error.message : "설정 정보를 불러오지 못했습니다."),
        );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [requestedPersonaCount, taskId]);

  if (!taskId) return <SimulationScenarioEditor />;

  const groups = options
    ? ([
        ["genders", "성별", options.filters.genders],
        ["age_groups", "연령대", options.filters.ageGroups],
        ["political_ideologies", "정치 성향", options.filters.politicalIdeologies],
      ] as const)
    : [];

  const canSubmit = Boolean(target && options && runInput);
  const canStart = Boolean(
    previewState.preview &&
    previewState.wallet &&
    capacityState.capacity?.canSimulate &&
    previewState.wallet.availableKrw >= previewState.preview.holdKrw,
  );
  const capacityMessage =
    capacityState.message ||
    (capacityState.capacity && !capacityState.capacity.canSimulate
      ? capacityBlockMessage(capacityState.capacity)
      : "");

  return (
    <form
      className="civic-domain-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!runInput) return;
        if (!capacityState.capacity?.canSimulate) return;
        if (!canStart || !previewState.preview) return void previewState.load();
        void start(runInput, previewState.preview.policyFingerprint);
      }}
    >
      <TaskSnapshotCard target={target} />
      <section className="civic-domain-form-section">
        <header>
          <h2>기본 실행 설정</h2>
        </header>
        <div className="civic-simulation-fields">
          <label className="civic-field">
            <span>페르소나 수</span>
            <input
              disabled={pending}
              max={SIMULATION_PERSONA_COUNT_MAX}
              min={SIMULATION_PERSONA_COUNT_MIN}
              onChange={(event) => setPersonaCount(event.currentTarget.valueAsNumber)}
              required
              type="number"
              value={personaCount}
            />
            <small>최소 100명 이상 최대 800명 이하</small>
          </label>
        </div>
      </section>
      <details
        className="civic-domain-form-section civic-simulation-panel-conditions"
        onToggle={(event) => setPanelOpen(event.currentTarget.open)}
        open={panelOpen}
      >
        <summary>페르소나 선정 (선택)</summary>
        <p aria-live="polite" className="civic-simulation-capacity-count">
          가능한 페르소나 수{" "}
          {capacityState.capacity
            ? `${capacityState.capacity.availablePersonaCount.toLocaleString("ko-KR")}명`
            : "-"}
        </p>
        <div className="civic-filter-grid">
          {groups.map(([key, label, values]) => (
            <FilterGroup
              key={key}
              label={label}
              onToggle={(value) =>
                setFilters((current) => ({ ...current, [key]: toggle(current[key] ?? [], value) }))
              }
              selected={filters[key] ?? []}
              values={values}
            />
          ))}
        </div>
      </details>
      <SimulationPreviewCard
        message={previewState.message}
        preview={previewState.preview}
        wallet={previewState.wallet}
      />
      <div className="civic-simulation-actions">
        <button
          className="civic-primary-action"
          disabled={
            !canSubmit ||
            pending ||
            capacityState.pending ||
            !capacityState.capacity?.canSimulate ||
            previewState.pending ||
            Boolean(previewState.preview && !canStart)
          }
          type="submit"
        >
          {pending
            ? "실행 요청 중…"
            : previewState.pending
              ? "예상 비용 계산 중…"
              : canStart
                ? "예상 비용 확인 후 실행"
                : previewState.preview
                  ? "공용 지갑 잔액 부족"
                  : "예상 비용 확인"}
        </button>
      </div>
      {message || startMessage || capacityMessage ? (
        <StatusMessage>{message || startMessage || capacityMessage}</StatusMessage>
      ) : null}
    </form>
  );
}

function SimulationStatus({
  onView,
  simulationId,
}: Readonly<{ onView?: (view: SimulationView) => void; simulationId: string | null }>) {
  const [view, setView] = useState<SimulationView | null>(null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    if (!simulationId) return null;
    try {
      const response = await authenticatedFetch(
        `/api/v1/admin/simulations/${encodeURIComponent(simulationId)}`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        setMessage(formatAdminProblem(await readAdminProblem(response)));
        return null;
      }
      const next = readSimulationView(await response.json());
      if (!next) return (setMessage("서버의 실행 상태 응답 형식을 확인해야 합니다."), null);
      setView(next);
      onView?.(next);
      setMessage("");
      return next;
    } catch {
      setMessage("네트워크 오류로 실행 상태를 불러오지 못했습니다.");
      return null;
    }
  }, [onView, simulationId]);

  useEffect(() => {
    let timer: number | undefined;
    let disposed = false;
    const poll = async () => {
      const next = await load();
      if (
        !disposed &&
        (!next || ["READY", "RUNNING", "WAITING_PROVIDER", "PUBLISHING"].includes(next.state))
      ) {
        timer = window.setTimeout(() => void poll(), 2000);
      }
    };
    timer = window.setTimeout(() => void poll(), 0);
    return () => {
      disposed = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [load]);

  if (!simulationId) return <MissingContext>확인할 실행을 선택해 주세요.</MissingContext>;

  const recoveryMessage = view ? simulationRecoveryMessage(view) : null;

  async function cancel() {
    setPending(true);
    try {
      const response = await authenticatedFetch(
        `/api/v1/admin/simulations/${encodeURIComponent(simulationId ?? "")}/cancel`,
        { method: "POST" },
      );
      if (!response.ok) return setMessage(formatAdminProblem(await readAdminProblem(response)));
      const next = readSimulationView(await response.json());
      if (next) {
        setView(next);
        onView?.(next);
      }
    } catch {
      await load();
      setMessage("취소 결과가 불명확하여 서버 상태를 다시 확인했습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="civic-domain-result civic-simulation-status-card">
      <header>
        <span>실행 상태</span>
        <h2>{view ? simulationStateLabel(view.state) : "실행 상태 확인 중"}</h2>
      </header>
      {view ? (
        <>
          <div className="civic-simulation-progress-label">
            <span>집계 진행률</span>
            <strong>{view.progressPercent}%</strong>
          </div>
          <progress max={100} value={view.progressPercent} />
          <dl className="civic-domain-impact-list">
            <div>
              <dt>페르소나</dt>
              <dd>{view.personaCount}명</dd>
            </div>
            <div>
              <dt>요청 시각</dt>
              <dd>{formatDate(view.createdAt)}</dd>
            </div>
            <div>
              <dt>시작 시각</dt>
              <dd>{formatDate(view.startedAt)}</dd>
            </div>
            <div>
              <dt>완료 시각</dt>
              <dd>{formatDate(view.completedAt)}</dd>
            </div>
            <div>
              <dt>전체 실행 완료 예상</dt>
              <dd>{wholeRunEtaLabel(view.estimatedCompletionAt)}</dd>
            </div>
            <div>
              <dt>자동 종료 기준</dt>
              <dd>{formatDate(view.deadlineAt)}</dd>
            </div>
            <div>
              <dt>예상 / 보류</dt>
              <dd>
                {formatKrw(view.estimatedKrw ?? undefined)} / {formatKrw(view.holdKrw ?? undefined)}
              </dd>
            </div>
            <div>
              <dt>정산</dt>
              <dd>{formatKrw(view.settledKrw ?? undefined)}</dd>
            </div>
            {view.state === "WAITING_PROVIDER" ? (
              <>
                <div>
                  <dt>자동 재개 예정</dt>
                  <dd>{formatDate(view.resumeAt)}</dd>
                </div>
                <div>
                  <dt>대기 이유</dt>
                  <dd>{providerWaitLabel(view.waitReason)}</dd>
                </div>
              </>
            ) : null}
          </dl>
          {recoveryMessage ? <StatusMessage>{recoveryMessage}</StatusMessage> : null}
          <div className="civic-simulation-actions">
            {view.canCancel ? (
              <button
                className="civic-danger-action"
                disabled={pending}
                onClick={() => void cancel()}
                type="button"
              >
                {view.cancelRequested ? "취소 처리 중" : "실행 취소"}
              </button>
            ) : null}
            {view.state === "COMPLETED" ? (
              <Link
                className="civic-primary-action"
                href={
                  `/admin/simulations/results?simulationId=${encodeURIComponent(view.simulationId)}` as Route
                }
              >
                결과 보기
              </Link>
            ) : null}
          </div>
          {["FAILED", "FAILED_PROVIDER", "REVIEW_REQUIRED"].includes(view.state) ? (
            <SimulationRetrySection simulationId={view.simulationId} view={view} />
          ) : null}
        </>
      ) : null}
      {message ? <StatusMessage>{message}</StatusMessage> : null}
    </section>
  );
}

function SimulationRetrySection({
  simulationId,
  view,
}: Readonly<{ simulationId: string; view: SimulationView }>) {
  const router = useRouter();
  const operationKey = useRef<string | null>(null);
  const [pending, setPending] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const recoveryMessage = simulationRecoveryMessage(view);
  const now = useRetryFenceClock(view.retryAvailableAt ?? null);
  const retryBlocked = isRetryBlocked(view.retryAvailableAt ?? null, now);

  async function retryFailed() {
    if (view.state !== "REVIEW_REQUIRED" || retryBlocked) return;
    operationKey.current ??= window.crypto.randomUUID();
    setPending(true);
    setActionMessage("");
    try {
      const response = await authenticatedFetch(
        `/api/v1/admin/simulations/${encodeURIComponent(simulationId)}/retry-failed`,
        {
          method: "POST",
          headers: { "idempotency-key": operationKey.current },
        },
      );
      if (!response.ok) {
        setActionMessage(formatAdminProblem(await readAdminProblem(response)));
        return;
      }
      const next = readSimulationView(await response.json());
      if (!next) {
        setActionMessage("서버의 재실행 응답 형식을 확인해야 합니다.");
        return;
      }
      router.push(
        `/admin/simulations/status?simulationId=${encodeURIComponent(next.simulationId)}` as Route,
      );
    } catch {
      setActionMessage("재실행 요청 결과가 불명확합니다. 다시 눌러도 중복 실행되지 않습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="civic-domain-action-panel civic-domain-danger-panel">
      <header>
        <span>수동 재실행</span>
        <h2>
          {view.state === "REVIEW_REQUIRED" ? "실패한 페르소나만 다시 실행" : "실패 내용 확인"}
        </h2>
      </header>
      <p>
        {recoveryMessage ??
          "실행 요청은 자동으로 반복하지 않습니다. 실행 환경을 확인한 뒤 같은 대상으로 새 실행을 요청하세요."}
      </p>
      {view.state === "REVIEW_REQUIRED" ? (
        <dl className="civic-domain-impact-list">
          <div>
            <dt>재실행 가능 시각</dt>
            <dd>{view.retryAvailableAt ? formatDate(view.retryAvailableAt) : "지금 가능"}</dd>
          </div>
        </dl>
      ) : null}
      <div className="civic-simulation-actions">
        {view.state === "REVIEW_REQUIRED" ? (
          <button
            className="civic-primary-action"
            disabled={pending || retryBlocked}
            onClick={() => setConfirmOpen(true)}
            type="button"
          >
            {pending
              ? "재실행 요청 중…"
              : retryBlocked
                ? "잠시 후 다시 시도해 주세요"
                : "실패한 페르소나만 다시 실행"}
          </button>
        ) : null}
        {!["REJECTED_PROVIDER_POLICY", "PUBLISHING"].includes(view.state) ? (
          <Link
            className="civic-secondary-action"
            href={`/admin/simulations/setup?taskId=${encodeURIComponent(view.taskId)}` as Route}
          >
            같은 대상으로 새 설정
          </Link>
        ) : null}
      </div>
      {actionMessage ? <StatusMessage>{actionMessage}</StatusMessage> : null}
      <ConfirmDialog
        busy={pending}
        confirmLabel="실패한 페르소나만 다시 실행"
        description={
          <p>
            완료하지 못한 페르소나 응답만 같은 설정으로 다시 실행합니다. 이미 완료된 응답은
            유지됩니다.
          </p>
        }
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          void retryFailed();
        }}
        open={confirmOpen}
        title="실패한 페르소나만 다시 실행"
      />
    </section>
  );
}

function SimulationResults({
  initialSlot = null,
  simulationId,
}: Readonly<{ initialSlot?: number | null; simulationId: string | null }>) {
  const [dimension, setDimension] = useState<SimulationResultDimension>("gender");
  const { loading, message, result } = useSimulationResult(simulationId);
  const {
    comparisons,
    loading: comparisonLoading,
    message: comparisonMessage,
  } = useSimulationResultComparisons(simulationId, result, dimension);
  const responses = useSimulationResponses(simulationId, initialSlot);

  if (!simulationId)
    return <MissingContext>확인할 시뮬레이션 결과를 선택해 주세요.</MissingContext>;
  const voteLinked = result ? result.task.status !== SCENARIO_TASK_STATUS : false;
  return (
    <section className="civic-domain-result">
      {result ? (
        <SimulationResultExplorer
          comparisonLoading={comparisonLoading}
          comparisonMessage={comparisonMessage}
          comparisons={comparisons}
          dimension={dimension}
          headerAction={
            voteLinked ? (
              <Link
                className="wf-button wf-button-secondary"
                href={`/admin/tasks/results?taskId=${encodeURIComponent(result.task.id)}` as Route}
              >
                투표 결과와 비교
              </Link>
            ) : null
          }
          loading={loading}
          onDimensionChange={setDimension}
          responses={responses}
          result={result}
          simulationId={simulationId}
        />
      ) : loading ? (
        <StatusMessage>시뮬레이션 결과를 불러오고 있습니다.</StatusMessage>
      ) : null}
      {message ? <StatusMessage>{message}</StatusMessage> : null}
    </section>
  );
}

// 투표 없이 작성한 시뮬레이션 스냅샷은 Simulation 서비스가 이 상태값으로 표시한다.
const SCENARIO_TASK_STATUS = "SIMULATION_ONLY";

function useSimulationResponses(
  simulationId: string | null,
  initialSlot: number | null,
): SimulationResponsesView {
  const [filters, setFilters] = useState<SimulationResponseFilters>({
    ageGroup: null,
    gender: null,
    optionId: null,
  });
  const [offset, setOffset] = useState(() =>
    initialSlot
      ? Math.floor((initialSlot - 1) / SIMULATION_RESPONSE_PAGE_SIZE) *
        SIMULATION_RESPONSE_PAGE_SIZE
      : 0,
  );
  const signature = simulationId ? JSON.stringify({ simulationId, offset, ...filters }) : null;
  const [state, setState] = useState<{
    message: string;
    page: SimulationResponsePage | null;
    signature: string;
  } | null>(null);

  useEffect(() => {
    if (!simulationId || !signature) return;
    let disposed = false;
    const timer = window.setTimeout(() => {
      const search = new URLSearchParams({
        offset: String(offset),
        limit: String(SIMULATION_RESPONSE_PAGE_SIZE),
      });
      if (filters.optionId) search.set("optionId", filters.optionId);
      if (filters.gender) search.set("gender", filters.gender);
      if (filters.ageGroup) search.set("ageGroup", filters.ageGroup);
      void authenticatedFetch(
        `/api/v1/admin/simulations/${encodeURIComponent(simulationId)}/results/responses?${search.toString()}`,
        { cache: "no-store" },
      )
        .then(async (response) => {
          if (!response.ok) throw new Error(formatAdminProblem(await readAdminProblem(response)));
          const page = readSimulationResponsePage(await response.json());
          if (!page) throw new Error("서버의 응답 목록 형식을 확인해야 합니다.");
          if (!disposed) setState({ message: "", page, signature });
        })
        .catch((error: unknown) => {
          if (!disposed)
            setState((current) => ({
              message: error instanceof Error ? error.message : "응답 목록을 불러오지 못했습니다.",
              page: current?.page ?? null,
              signature,
            }));
        });
    }, 0);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [filters, offset, signature, simulationId]);

  return {
    filters,
    highlightSlot: initialSlot,
    loading: Boolean(signature && state?.signature !== signature),
    message: state?.message ?? "",
    offset,
    onFiltersChange: (next) => {
      setFilters(next);
      setOffset(0);
    },
    onOffsetChange: setOffset,
    page: state?.page ?? null,
  };
}

function useStartSimulation(taskId: string | null) {
  const router = useRouter();
  const requestRef = useRef<{ key: string; signature: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  const start = useCallback(
    async (input: RunInput, pricingFingerprint: string) => {
      if (!taskId) return;
      const body = buildAdminSimulationRequest(taskId, input, pricingFingerprint);
      const signature = JSON.stringify(body);
      if (!requestRef.current || requestRef.current.signature !== signature) {
        requestRef.current = { key: window.crypto.randomUUID(), signature };
      }
      setPending(true);
      setMessage("");
      try {
        const response = await requestAdminSimulationStart(
          taskId,
          input,
          pricingFingerprint,
          requestRef.current.key,
        );
        if (!response.ok) return setMessage(formatAdminProblem(await readAdminProblem(response)));
        const created = readSimulationView(await response.json());
        if (!created) return setMessage("서버의 실행 요청 응답 형식을 확인해야 합니다.");
        router.push(
          `/admin/simulations/status?simulationId=${encodeURIComponent(created.simulationId)}` as Route,
        );
      } catch {
        setMessage(
          "실행 요청 결과가 불명확합니다. 같은 설정으로 다시 눌러도 중복 실행되지 않습니다.",
        );
      } finally {
        setPending(false);
      }
    },
    [router, taskId],
  );

  return { pending, start, startMessage: message };
}

function useSimulationCapacity(input: CapacityInput | null) {
  const signature = input
    ? JSON.stringify({
        personaCount: input.personaCount,
        sampleSeed: input.sampleSeed,
        filters: input.filters ?? {},
      })
    : null;
  const [result, setResult] = useState<{
    capacity: SimulationCapacity;
    signature: string;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const current = result?.signature === signature ? result.capacity : null;

  useEffect(() => {
    if (!signature) return;
    let disposed = false;
    const timer = window.setTimeout(() => {
      setPending(true);
      setMessage("");
      void authenticatedFetch("/api/v1/admin/simulation-capacity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: signature,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error(formatAdminProblem(await readAdminProblem(response)));
          const capacity = readSimulationCapacity(await response.json());
          if (!capacity) throw new Error("서버의 페르소나 수용량 응답 형식을 확인해야 합니다.");
          if (!disposed) setResult({ capacity, signature });
        })
        .catch((error: unknown) => {
          if (!disposed)
            setMessage(
              error instanceof Error ? error.message : "페르소나 수용량을 확인하지 못했습니다.",
            );
        })
        .finally(() => {
          if (!disposed) setPending(false);
        });
    }, 150);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [signature]);

  return {
    capacity: current,
    message: signature ? message : "",
    pending: Boolean(signature && pending),
  };
}

function useSimulationPreview(taskId: string | null, input: RunInput | null) {
  const signature =
    taskId && input ? JSON.stringify(buildAdminSimulationRequest(taskId, input)) : null;
  const [result, setResult] = useState<{
    preview: SimulationPreview;
    signature: string;
    wallet: WalletSummary;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const current = result?.signature === signature ? result : null;

  const load = useCallback(async () => {
    if (!taskId || !input || !signature) return;
    setPending(true);
    setMessage("");
    try {
      const [previewResponse, walletResponse] = await Promise.all([
        requestAdminSimulationPreview(taskId, input),
        authenticatedFetch("/api/v1/admin/simulation-billing/wallet", {
          cache: "no-store",
        }),
      ]);
      if (!previewResponse.ok) {
        return setMessage(formatAdminProblem(await readAdminProblem(previewResponse)));
      }
      if (!walletResponse.ok) {
        return setMessage(formatAdminProblem(await readAdminProblem(walletResponse)));
      }
      const preview = readSimulationPreview(await previewResponse.json());
      const wallet = readWalletSummary(await walletResponse.json());
      if (!preview || !wallet) return setMessage("예상 비용 응답 형식을 확인해야 합니다.");
      setResult({ preview, signature, wallet });
    } catch {
      setMessage("네트워크 오류로 예상 비용을 계산하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }, [input, signature, taskId]);

  return {
    load,
    message,
    pending,
    preview: current?.preview ?? null,
    wallet: current?.wallet ?? null,
  };
}

export function SimulationPreviewCard({
  message,
  preview,
  wallet,
}: Readonly<{
  message: string;
  preview: SimulationPreview | null;
  wallet: WalletSummary | null;
}>) {
  if (!preview && !message) return null;
  return (
    <section className="civic-domain-form-section civic-simulation-preview-card">
      <header>
        <span>실행 전 확인</span>
        <h2>예상 비용과 시간</h2>
      </header>
      {preview ? (
        <dl className="civic-domain-impact-list">
          <div>
            <dt>예상 과금액</dt>
            <dd>{formatKrw(preview.estimatedKrw)}</dd>
          </div>
          <div>
            <dt>보류 예정액</dt>
            <dd>{formatKrw(preview.holdKrw)}</dd>
          </div>
          <div>
            <dt>예상 시간</dt>
            <dd>
              {preview.estimatedSeconds === null
                ? "근거 수집 중"
                : `약 ${preview.estimatedSeconds.toLocaleString("ko-KR")}초`}
            </dd>
          </div>
          <div>
            <dt>사용 가능액</dt>
            <dd>{formatKrw(wallet?.availableKrw)}</dd>
          </div>
        </dl>
      ) : null}
      {message ? <StatusMessage>{message}</StatusMessage> : null}
    </section>
  );
}

function useRetryFenceClock(retryAvailableAt: string | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!retryAvailableAt) return;
    const target = Date.parse(retryAvailableAt);
    if (!Number.isFinite(target) || target <= now) return;
    const timer = window.setTimeout(
      () => setNow(Date.now()),
      Math.min(target - now + 25, 2_147_483_647),
    );
    return () => window.clearTimeout(timer);
  }, [now, retryAvailableAt]);
  return now;
}

function useSimulationResult(simulationId: string | null) {
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(Boolean(simulationId));
  const [settledSimulationId, setSettledSimulationId] = useState<string | null>(null);
  useEffect(() => {
    if (!simulationId) return;
    let disposed = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setMessage("");
      void authenticatedFetch(
        `/api/v1/admin/simulations/${encodeURIComponent(simulationId)}/results`,
        { cache: "no-store" },
      )
        .then(async (response) => {
          if (!response.ok) throw new Error(formatAdminProblem(await readAdminProblem(response)));
          const next = readSimulationResult(await response.json());
          if (!next) throw new Error("서버의 집계 결과 응답 형식을 확인해야 합니다.");
          if (!disposed) {
            setResult(next);
            setSettledSimulationId(simulationId);
          }
        })
        .catch((error: unknown) => {
          if (!disposed) {
            setResult(null);
            setMessage(error instanceof Error ? error.message : "집계 결과를 불러오지 못했습니다.");
            setSettledSimulationId(simulationId);
          }
        })
        .finally(() => {
          if (!disposed) setLoading(false);
        });
    }, 0);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [simulationId]);
  const currentSettled = settledSimulationId === simulationId;
  return {
    loading: Boolean(simulationId && (loading || !currentSettled)),
    message: currentSettled ? message : "",
    result: currentSettled ? result : null,
  };
}

function useSimulationResultComparisons(
  simulationId: string | null,
  result: SimulationResult | null,
  dimension: SimulationResultDimension,
) {
  const values = useMemo(
    () =>
      dimension === "gender"
        ? (result?.availableFilters.genders ?? [])
        : dimension === "ageGroup"
          ? (result?.availableFilters.ageGroups ?? [])
          : [],
    [dimension, result],
  );
  const signature =
    simulationId && dimension !== "all" && values.length > 0
      ? `${simulationId}:${dimension}:${values.join("\u0000")}`
      : null;
  const [state, setState] = useState<{
    comparisons: readonly SimulationResultComparison[];
    message: string;
    signature: string;
  } | null>(null);
  const [loadingSignature, setLoadingSignature] = useState<string | null>(null);

  useEffect(() => {
    if (!simulationId || !signature || values.length === 0) return;
    let disposed = false;
    const timer = window.setTimeout(() => {
      setLoadingSignature(signature);
      void Promise.allSettled(
        values.map(async (value): Promise<SimulationResultComparison> => {
          const search = new URLSearchParams();
          search.set(dimension === "gender" ? "gender" : "ageGroup", value);
          const response = await authenticatedFetch(
            `/api/v1/admin/simulations/${encodeURIComponent(simulationId)}/results?${search.toString()}`,
            { cache: "no-store" },
          );
          if (!response.ok) throw new Error(formatAdminProblem(await readAdminProblem(response)));
          const comparison = readSimulationResult(await response.json());
          if (!comparison) throw new Error("서버의 집단별 결과 응답 형식을 확인해야 합니다.");
          return { label: value, result: comparison };
        }),
      ).then((settled) => {
        if (disposed) return;
        const comparisons = settled.flatMap((item) =>
          item.status === "fulfilled" ? [item.value] : [],
        );
        const failureCount = settled.length - comparisons.length;
        setState({
          comparisons,
          message:
            failureCount > 0
              ? `${failureCount.toLocaleString("ko-KR")}개 집단의 비교 결과를 불러오지 못했습니다.`
              : "",
          signature,
        });
        setLoadingSignature(null);
      });
    }, 0);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [dimension, signature, simulationId, values]);

  return {
    comparisons: state?.signature === signature ? state.comparisons : [],
    loading: Boolean(
      signature && (loadingSignature === signature || state?.signature !== signature),
    ),
    message: state?.signature === signature ? state.message : "",
  };
}

function TaskSnapshotCard({ target }: Readonly<{ target: SimulationTarget | null }>) {
  return (
    <section className="civic-domain-description">
      {target ? (
        <span className="civic-simulation-target-kind">
          {target.kind === "vote"
            ? "투표 기반 시뮬레이션 · 결과를 투표와 비교"
            : "직접 작성한 시뮬레이션"}
        </span>
      ) : null}
      <h2>{target?.title ?? "시뮬레이션 대상 불러오는 중"}</h2>
      <p>{target?.question || "질문을 확인하고 있습니다."}</p>
      {target?.options.length ? (
        <ol className="civic-task-options-readonly">
          {target.options.map((option) => (
            <li key={option.id}>{option.content}</li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

function FilterGroup({
  label,
  onToggle,
  selected,
  values,
}: Readonly<{
  label: string;
  onToggle: (value: string) => void;
  selected: readonly string[];
  values: readonly string[];
}>) {
  return (
    <fieldset className="civic-filter-group">
      <legend>{label}</legend>
      <div>
        {values.map((value) => (
          <label key={value}>
            <input
              checked={selected.includes(value)}
              onChange={() => onToggle(value)}
              type="checkbox"
            />
            <span>{value}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function StatusMessage({ children }: Readonly<{ children: string }>) {
  return (
    <p aria-live="polite" className="civic-domain-empty" role="status">
      {children}
    </p>
  );
}

function MissingContext({ children }: Readonly<{ children: string }>) {
  return (
    <div className="civic-domain-empty">
      <p>{children}</p>
      <Link className="civic-primary-action" href="/admin/simulations">
        시뮬레이션 목록으로 돌아가기
      </Link>
    </div>
  );
}

export function buildDefaultSimulationRunInput(
  personaCount: number,
  options: SimulationOptions,
  filters?: Readonly<Record<string, readonly string[]>>,
): RunInput | null {
  const limits = simulationPersonaCountLimits(options);
  if (!isPersonaCountWithinLimit(personaCount, limits.min, limits.max) || !options.defaultModel)
    return null;
  return {
    personaCount,
    modelType: options.defaultModel,
    sampleSeed: null,
    filters: filters ?? { regions: options.filters.regions },
  };
}

function simulationPersonaCountLimits(options: SimulationOptions) {
  return {
    min: Math.max(SIMULATION_PERSONA_COUNT_MIN, options.minPersonaCount),
    max: Math.min(SIMULATION_PERSONA_COUNT_MAX, options.maxPersonaCount),
  };
}

export function buildAdminSimulationRequest(
  taskId: string,
  input: RunInput,
  pricingFingerprint?: string,
) {
  return {
    taskId,
    personaCount: input.personaCount,
    modelType: input.modelType,
    sampleSeed: input.sampleSeed,
    filters: input.filters ?? {},
    ...(pricingFingerprint === undefined ? {} : { pricingFingerprint }),
  };
}

export function requestAdminSimulationStart(
  taskId: string,
  input: RunInput,
  pricingFingerprint: string,
  idempotencyKey: string,
  request: typeof fetch = authenticatedFetch,
): Promise<Response> {
  return request(ADMIN_SIMULATION_PATHS.create, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify(buildAdminSimulationRequest(taskId, input, pricingFingerprint)),
  });
}

export function requestAdminSimulationPreview(
  taskId: string,
  input: RunInput,
  request: typeof fetch = authenticatedFetch,
): Promise<Response> {
  return request(ADMIN_SIMULATION_PATHS.preview, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(buildAdminSimulationRequest(taskId, input)),
  });
}

function normalizeCapacityInput(
  personaCount: number | null,
  seed: string,
  filters?: Readonly<Record<string, readonly string[]>>,
): CapacityInput | null {
  if (personaCount === null || !Number.isSafeInteger(personaCount) || personaCount <= 0)
    return null;
  const parsedSeed = seed.trim() === "" ? null : integer(seed);
  if (parsedSeed === undefined) return null;
  return {
    personaCount,
    sampleSeed: parsedSeed,
    ...(filters === undefined ? {} : { filters }),
  };
}

function toggle(values: readonly string[], value: string): readonly string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function first(value: string | readonly string[] | undefined): string | null {
  return typeof value === "string" ? value : (value?.[0] ?? null);
}

function integer(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function positiveInteger(value: string | null): number | null {
  if (value === null) return null;
  const parsed = integer(value);
  return parsed && parsed > 0 ? parsed : null;
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("ko-KR");
}

function capacityBlockMessage(capacity: SimulationCapacity): string {
  if (capacity.availablePersonaCount < capacity.requestedPersonaCount) {
    return "조건에 따른 페르소나 수가 부족합니다.";
  }
  if (capacity.blockReason === "PERSONA_COUNT_BELOW_MINIMUM") {
    return `페르소나 수를 ${Math.max(SIMULATION_PERSONA_COUNT_MIN, capacity.minPersonaCount).toLocaleString("ko-KR")}명 이상으로 입력해 주세요.`;
  }
  if (capacity.blockReason === "PERSONA_COUNT_ABOVE_MAXIMUM") {
    return `페르소나 수를 ${Math.min(SIMULATION_PERSONA_COUNT_MAX, capacity.maxPersonaCount).toLocaleString("ko-KR")}명 이하로 입력해 주세요.`;
  }
  return `현재 조건에서 사용할 수 있는 페르소나는 ${capacity.availablePersonaCount.toLocaleString("ko-KR")}명입니다. 성별·연령대·거주 지역·정치 성향 조건이나 요청 수를 조정해 주세요.`;
}

export function simulationStateTone(state: SimulationState | null): SimulationStateTone {
  if (state === "COMPLETED") return "success";
  if (state === "FAILED" || state === "FAILED_PROVIDER" || state === "CANCELLED") return "danger";
  if (
    state === "READY" ||
    state === "RUNNING" ||
    state === "WAITING_PROVIDER" ||
    state === "PUBLISHING"
  ) {
    return "active";
  }
  return "neutral";
}

export function simulationStateLabel(state: SimulationState): string {
  return {
    READY: "실행 대기",
    RUNNING: "실행 중",
    WAITING_PROVIDER: "공급자 응답 대기",
    COMPLETED: "완료",
    FAILED: "실패",
    FAILED_PROVIDER: "외부 모델 호출 실패",
    REVIEW_REQUIRED: "일부 페르소나 응답 실패",
    PUBLISHING: "결과 정리 중",
    REJECTED_PROVIDER_POLICY: "시뮬레이션 불가",
    CANCELLED: "취소됨",
  }[state];
}

export function simulationRecoveryMessage(
  view: Pick<SimulationView, "state" | "errorCode">,
): string | null {
  if (view.state === "REJECTED_PROVIDER_POLICY") {
    return "이 질문은 AI 공급자 정책상 시뮬레이션할 수 없습니다.";
  }
  if (view.state === "REVIEW_REQUIRED") {
    return "일부 페르소나 응답을 완료하지 못했습니다. 실패한 페르소나만 다시 실행할 수 있습니다.";
  }
  if (view.state === "FAILED_PROVIDER" || view.errorCode === "CALIBRATION_ATTEMPTS_EXHAUSTED") {
    return "AI 응답 검증에 반복 실패해 시뮬레이션을 중단했습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (view.state === "FAILED") {
    return "실행 중 오류가 발생했습니다. 실행 환경을 확인한 뒤 새 실행을 요청하세요.";
  }
  return null;
}

export function providerWaitLabel(reason: string | null): string {
  void reason;
  return "외부 모델 응답 지연으로 자동 재시도 중입니다.";
}

export function roundWholeRunEtaSeconds(seconds: number): number | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const unit = seconds >= 3600 ? 300 : 60;
  return Math.ceil(seconds / unit) * unit;
}

export function isRetryBlocked(retryAvailableAt: string | null, now: number): boolean {
  if (!retryAvailableAt) return false;
  const target = Date.parse(retryAvailableAt);
  return Number.isFinite(target) && target > now;
}

function wholeRunEtaLabel(estimatedCompletionAt: string | null): string {
  if (!estimatedCompletionAt) return "계산 중";
  const target = Date.parse(estimatedCompletionAt);
  if (!Number.isFinite(target)) return "-";
  const remaining = roundWholeRunEtaSeconds((target - Date.now()) / 1000);
  if (remaining === null) return "완료 처리 중";
  return `${formatDate(estimatedCompletionAt)} · 약 ${Math.ceil(remaining / 60).toLocaleString("ko-KR")}분 후`;
}

function simulationLayout(screenId: string): string {
  return (
    {
      "A-SIM-001": "simulation-task-list",
      "A-SIM-002": "simulation-setup",
      "A-SIM-003": "simulation-panel-filter",
      "A-SIM-004": "simulation-status",
      "A-SIM-005": "simulation-retry",
      "A-SIM-006": "simulation-results",
      "A-SIM-007": "simulation-panel-detail",
    }[screenId] ?? "simulation"
  );
}
