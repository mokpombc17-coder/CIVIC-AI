"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScreenFrame } from "@/components/screens/screen-frame";
import {
  readSimulationSection,
  SimulationBillingSection,
  SimulationSectionTabs,
} from "@/components/admin/simulation-billing-panels";
import {
  AnonymousPanelAttributes,
  PublicSimulationEvidence,
} from "@/components/admin/simulation-result-presentation";
import {
  formatAdminProblem,
  readAdminProblem,
  readTaskDetail,
  type TaskDetail,
} from "@/lib/admin/domain-contracts";
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
  readSimulationTaskSummaries,
  readSimulationView,
  simulationTargetHref,
  simulationTargetPresentation,
  type SimulationCapacity,
  type SimulationOptions,
  type SimulationResult,
  type SimulationState,
  type SimulationTaskSummary,
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

export function AdminSimulationScreen({
  screen,
  query,
}: Readonly<{ screen: ScreenDefinition; query: AdminQuery }>) {
  const taskId = first(query.taskId);
  const simulationId = first(query.simulationId);
  const section = screen.id === "A-SIM-001" ? readSimulationSection(first(query.section)) : "run";

  return (
    <ScreenFrame
      {...(screen.id === "A-SIM-001" ? {} : { backHref: "/admin/simulations" as Route })}
      screen={screen}
    >
      <div
        className="civic-admin-workbench civic-domain-console civic-simulation-console"
        data-wireflow-layout={simulationLayout(screen.id)}
      >
        <SimulationSectionTabs active={section} />
        {screen.id === "A-SIM-001" && section === "run" ? <SimulationTargets /> : null}
        {screen.id === "A-SIM-001" ? <SimulationBillingSection section={section} /> : null}
        {screen.id === "A-SIM-002" ? <SimulationSetup taskId={taskId} /> : null}
        {screen.id === "A-SIM-003" ? <ManualPanel query={query} taskId={taskId} /> : null}
        {screen.id === "A-SIM-004" ? <SimulationStatus simulationId={simulationId} /> : null}
        {screen.id === "A-SIM-005" ? <SimulationRetry simulationId={simulationId} /> : null}
        {screen.id === "A-SIM-006" ? <SimulationResults simulationId={simulationId} /> : null}
        {screen.id === "A-SIM-007" ? (
          <SimulationPanelDetail query={query} simulationId={simulationId} />
        ) : null}
      </div>
    </ScreenFrame>
  );
}

function SimulationTargets() {
  const [items, setItems] = useState<readonly SimulationTaskSummary[]>([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await authenticatedFetch("/api/v1/admin/simulation-tasks", {
        cache: "no-store",
      });
      if (!response.ok) {
        setMessage(formatAdminProblem(await readAdminProblem(response)));
        return;
      }
      const tasks = readSimulationTaskSummaries(await response.json());
      if (!tasks) return setMessage("서버의 과업 목록 응답 형식을 확인해야 합니다.");
      setItems(tasks);
      setMessage("");
    } catch {
      setMessage("네트워크 오류로 과업 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const filtered = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase("ko-KR");
    return normalized
      ? items.filter((item) => item.title.toLocaleLowerCase("ko-KR").includes(normalized))
      : items;
  }, [items, search]);

  return (
    <>
      <div className="civic-domain-toolbar civic-simulation-toolbar">
        <label className="civic-field">
          <span>시뮬레이션할 과업 찾기</span>
          <input
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder="과업 제목 입력…"
            type="search"
            value={search}
          />
        </label>
        <button className="civic-secondary-action" onClick={() => void load()} type="button">
          새로고침
        </button>
      </div>
      <div
        aria-label="시뮬레이션 과업 목록"
        className="civic-table-scroll"
        role="region"
        tabIndex={0}
      >
        <table className="civic-admin-table">
          <thead>
            <tr>
              <th>과업 제목</th>
              <th>시뮬레이션 진행 상태</th>
              <th>최근 변경</th>
              <th>실행</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  {loading ? "과업을 불러오는 중입니다." : "조건에 맞는 과업이 없습니다."}
                </td>
              </tr>
            ) : null}
            {filtered.map((task) => {
              const presentation = simulationTargetPresentation(
                task.latestSimulation?.state ?? null,
              );
              return (
                <tr key={task.taskId}>
                  <th scope="row">{task.title}</th>
                  <td>
                    <span className={`civic-domain-status is-${presentation.tone}`}>
                      {presentation.label}
                    </span>
                  </td>
                  <td>{formatDate(simulationTargetUpdatedAt(task))}</td>
                  <td>
                    <Link
                      className="civic-primary-action"
                      href={simulationTargetHref(task.taskId, task.latestSimulation) as Route}
                    >
                      {presentation.action}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {message ? <StatusMessage>{message}</StatusMessage> : null}
    </>
  );
}

function SimulationSetup({ taskId }: Readonly<{ taskId: string | null }>) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [options, setOptions] = useState<SimulationOptions | null>(null);
  const [personaCount, setPersonaCount] = useState(30);
  const [message, setMessage] = useState("");
  const { pending, start, startMessage } = useStartSimulation(taskId);
  const runInput = options ? buildDefaultSimulationRunInput(personaCount, options) : null;
  const capacityState = useSimulationCapacity(
    options ? normalizeCapacityInput(personaCount, "") : null,
  );
  const previewState = useSimulationPreview(taskId, runInput);

  useEffect(() => {
    if (!taskId) return;
    const timer = window.setTimeout(() => {
      void Promise.all([
        authenticatedFetch(`/api/v1/admin/simulation-tasks/${encodeURIComponent(taskId)}`, {
          cache: "no-store",
        }),
        authenticatedFetch("/api/v1/admin/simulation-options", { cache: "no-store" }),
      ])
        .then(async ([taskResponse, optionsResponse]) => {
          if (!taskResponse.ok)
            throw new Error(formatAdminProblem(await readAdminProblem(taskResponse)));
          if (!optionsResponse.ok)
            throw new Error(formatAdminProblem(await readAdminProblem(optionsResponse)));
          const nextTask = readTaskDetail(await taskResponse.json());
          const nextOptions = readSimulationOptions(await optionsResponse.json());
          if (!nextTask || !nextOptions) throw new Error("서버 응답 형식을 확인해야 합니다.");
          setTask(nextTask);
          setOptions(nextOptions);
          setPersonaCount(nextOptions.minPersonaCount);
          setMessage("");
        })
        .catch((error: unknown) =>
          setMessage(error instanceof Error ? error.message : "설정 정보를 불러오지 못했습니다."),
        );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [taskId]);

  if (!taskId) return <MissingContext>먼저 시뮬레이션할 과업을 선택해 주세요.</MissingContext>;

  const canSubmit = Boolean(task && options && runInput);
  const canStart = Boolean(
    previewState.preview &&
    previewState.wallet &&
    capacityState.capacity?.canSimulate &&
    previewState.wallet.availableKrw >= previewState.preview.holdKrw,
  );

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
      <TaskSnapshotCard task={task} />
      <section className="civic-domain-form-section">
        <header>
          <span>SONA 집계 실행</span>
          <h2>기본 실행 설정</h2>
        </header>
        <div className="civic-simulation-fields">
          <label className="civic-field">
            <span>페르소나 수</span>
            <input
              disabled={pending}
              max={options?.maxPersonaCount ?? 1}
              min={options?.minPersonaCount ?? 1}
              onChange={(event) => setPersonaCount(event.currentTarget.valueAsNumber)}
              required
              type="number"
              value={personaCount}
            />
            <small>
              현재 환경 {options?.minPersonaCount ?? "-"}명 이상 {options?.maxPersonaCount ?? "-"}명
              이하
            </small>
          </label>
        </div>
      </section>
      <SimulationCapacityCard capacity={capacityState.capacity} message={capacityState.message} />
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
                  : "예상 비용 먼저 확인"}
        </button>
        {runInput ? (
          <Link className="civic-secondary-action" href={manualPanelHref(taskId, personaCount)}>
            수동 패널 조건 설정
          </Link>
        ) : null}
      </div>
      {message || startMessage ? <StatusMessage>{message || startMessage}</StatusMessage> : null}
    </form>
  );
}

function ManualPanel({ query, taskId }: Readonly<{ query: AdminQuery; taskId: string | null }>) {
  const [options, setOptions] = useState<SimulationOptions | null>(null);
  const [filters, setFilters] = useState<Record<string, readonly string[]>>({});
  const [message, setMessage] = useState("");
  const { pending, start, startMessage } = useStartSimulation(taskId);
  const personaCount = positiveInteger(first(query.personaCount));
  const personaCountAllowed = Boolean(
    options &&
    personaCount &&
    isPersonaCountWithinLimit(personaCount, options.minPersonaCount, options.maxPersonaCount),
  );
  const runInput: RunInput | null =
    taskId && personaCount && options && personaCountAllowed
      ? buildDefaultSimulationRunInput(personaCount, options, filters)
      : null;
  const previewState = useSimulationPreview(taskId, runInput);
  const capacityState = useSimulationCapacity(
    options ? normalizeCapacityInput(personaCount, "", filters) : null,
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void authenticatedFetch("/api/v1/admin/simulation-options", { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw new Error(formatAdminProblem(await readAdminProblem(response)));
          const value = readSimulationOptions(await response.json());
          if (!value) throw new Error("서버의 패널 조건 응답 형식을 확인해야 합니다.");
          setOptions(value);
        })
        .catch((error: unknown) =>
          setMessage(error instanceof Error ? error.message : "패널 조건을 불러오지 못했습니다."),
        );
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  if (!taskId || !personaCount) {
    return <MissingContext>기본 실행 설정부터 입력해 주세요.</MissingContext>;
  }

  const groups = options
    ? ([
        ["genders", "성별", options.filters.genders],
        ["age_groups", "연령대", options.filters.ageGroups],
        ["regions", "거주 지역", options.filters.regions],
        ["political_ideologies", "정치 성향", options.filters.politicalIdeologies],
      ] as const)
    : [];

  return (
    <form
      className="civic-domain-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!runInput) return;
        if (!capacityState.capacity?.canSimulate) return;
        if (!previewState.preview) return void previewState.load();
        if (!previewState.wallet || previewState.wallet.availableKrw < previewState.preview.holdKrw)
          return;
        void start(runInput, previewState.preview.policyFingerprint);
      }}
    >
      <section className="civic-domain-form-section">
        <header>
          <span>활성 SONA 데이터 기준</span>
          <h2>집계 패널 표본 조건</h2>
        </header>
        <p className="civic-simulation-copy">
          항목을 선택하지 않으면 해당 범주는 전체를 사용합니다. 여기에 표시되는 값은 현재 서버에
          마운트된 프로필 번들에서 읽은 범주이며 개인 레코드는 노출하지 않습니다.
        </p>
        {options && !personaCountAllowed ? (
          <StatusMessage>
            {`페르소나 수는 현재 환경에서 ${options.minPersonaCount}명부터 ${options.maxPersonaCount}명까지 입력할 수 있습니다.`}
          </StatusMessage>
        ) : null}
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
      </section>
      <SimulationCapacityCard capacity={capacityState.capacity} message={capacityState.message} />
      <SimulationPreviewCard
        message={previewState.message}
        preview={previewState.preview}
        wallet={previewState.wallet}
      />
      <div className="civic-simulation-actions">
        <button
          className="civic-primary-action"
          disabled={
            !options ||
            pending ||
            capacityState.pending ||
            !capacityState.capacity?.canSimulate ||
            previewState.pending ||
            Boolean(
              previewState.preview &&
              (!previewState.wallet ||
                previewState.wallet.availableKrw < previewState.preview.holdKrw),
            )
          }
          type="submit"
        >
          {pending
            ? "실행 요청 중…"
            : previewState.pending
              ? "예상 비용 계산 중…"
              : previewState.preview
                ? `${personaCount}명 집계 시뮬레이션 실행`
                : "예상 비용 먼저 확인"}
        </button>
      </div>
      {message || startMessage ? <StatusMessage>{message || startMessage}</StatusMessage> : null}
    </form>
  );
}

function SimulationStatus({ simulationId }: Readonly<{ simulationId: string | null }>) {
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
      setMessage("");
      return next;
    } catch {
      setMessage("네트워크 오류로 실행 상태를 불러오지 못했습니다.");
      return null;
    }
  }, [simulationId]);

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
      if (next) setView(next);
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
        <span>SONA 워커</span>
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
              <dt>가상 패널</dt>
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
              <dt>실행 기한</dt>
              <dd>{formatDate(view.deadlineAt)}</dd>
            </div>
            <div>
              <dt>예상 / 보류</dt>
              <dd>
                {formatKrw(view.estimatedKrw ?? undefined)} / {formatKrw(view.holdKrw ?? undefined)}
              </dd>
            </div>
            <div>
              <dt>정산 / 서비스 부담</dt>
              <dd>
                {formatKrw(view.settledKrw ?? undefined)} /{" "}
                {formatKrw(view.absorbedKrw ?? undefined)}
              </dd>
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
                집계 결과 보기
              </Link>
            ) : null}
            {["FAILED", "FAILED_PROVIDER", "REVIEW_REQUIRED"].includes(view.state) ? (
              <Link
                className="civic-primary-action"
                href={
                  `/admin/simulations/retry?simulationId=${encodeURIComponent(view.simulationId)}` as Route
                }
              >
                {view.state === "REVIEW_REQUIRED" ? "실패 패널만 다시 실행" : "실패 내용 확인"}
              </Link>
            ) : null}
          </div>
        </>
      ) : null}
      {message ? <StatusMessage>{message}</StatusMessage> : null}
    </section>
  );
}

function SimulationRetry({ simulationId }: Readonly<{ simulationId: string | null }>) {
  const { message, view } = useSimulationView(simulationId);
  const router = useRouter();
  const operationKey = useRef<string | null>(null);
  const [pending, setPending] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const recoveryMessage = view ? simulationRecoveryMessage(view) : null;
  const now = useRetryFenceClock(view?.retryAvailableAt ?? null);
  const retryBlocked = isRetryBlocked(view?.retryAvailableAt ?? null, now);

  async function retryFailed() {
    if (!simulationId || !view || view.state !== "REVIEW_REQUIRED" || retryBlocked) return;
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
      setActionMessage(
        "재실행 요청 결과가 불명확합니다. 다시 누르면 동일 요청 키로 서버 상태를 확인합니다.",
      );
    } finally {
      setPending(false);
    }
  }

  if (!simulationId) return <MissingContext>재실행할 실행을 선택해 주세요.</MissingContext>;
  return (
    <section className="civic-domain-action-panel civic-domain-danger-panel">
      <header>
        <span>수동 재실행</span>
        <h2>{view?.state === "REVIEW_REQUIRED" ? "실패 패널만 다시 실행" : "실패 내용 확인"}</h2>
      </header>
      <p>
        {recoveryMessage ??
          "실행 요청은 자동으로 반복하지 않습니다. 실행 환경을 확인한 뒤 같은 과업에서 새 실행을 요청하세요."}
      </p>
      {view ? (
        <dl className="civic-domain-impact-list">
          <div>
            <dt>상태</dt>
            <dd>{simulationStateLabel(view.state)}</dd>
          </div>
          <div>
            <dt>다음 조치</dt>
            <dd>{recoveryMessage ?? "실행 환경 확인 후 다시 실행"}</dd>
          </div>
          <div>
            <dt>가상 패널</dt>
            <dd>{view.personaCount}명</dd>
          </div>
          <div>
            <dt>완료 시각</dt>
            <dd>{formatDate(view.completedAt)}</dd>
          </div>
          {view.state === "REVIEW_REQUIRED" ? (
            <div>
              <dt>재실행 가능 시각</dt>
              <dd>{view.retryAvailableAt ? formatDate(view.retryAvailableAt) : "지금 가능"}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      {view?.state === "REVIEW_REQUIRED" ? (
        <button
          className="civic-primary-action"
          disabled={pending || retryBlocked}
          onClick={() => void retryFailed()}
          type="button"
        >
          {pending
            ? "재실행 요청 중…"
            : retryBlocked
              ? "잠시 후 다시 시도해 주세요"
              : "실패 패널만 다시 실행"}
        </button>
      ) : view && !["REJECTED_PROVIDER_POLICY", "PUBLISHING"].includes(view.state) ? (
        <Link
          className="civic-primary-action"
          href={`/admin/simulations/setup?taskId=${encodeURIComponent(view.taskId)}` as Route}
        >
          같은 과업으로 새 설정
        </Link>
      ) : null}
      {message || actionMessage ? <StatusMessage>{message || actionMessage}</StatusMessage> : null}
    </section>
  );
}

function SimulationResults({ simulationId }: Readonly<{ simulationId: string | null }>) {
  const { message, result } = useSimulationResult(simulationId);
  if (!simulationId)
    return <MissingContext>확인할 시뮬레이션 결과를 선택해 주세요.</MissingContext>;
  return (
    <section className="civic-domain-result">
      <header>
        <span>SONA 집계</span>
        <h2>{result?.task.title ?? "집계 결과 불러오는 중"}</h2>
      </header>
      {result ? (
        <>
          <p className="civic-simulation-question">{result.task.question.content}</p>
          <dl className="civic-domain-impact-list">
            <div>
              <dt>요청 패널</dt>
              <dd>{result.summary.requestedPersonaCount}명</dd>
            </div>
            <div>
              <dt>응답 패널</dt>
              <dd>{result.summary.answeredPersonaCount}명</dd>
            </div>
            <div>
              <dt>미응답</dt>
              <dd>{result.summary.unansweredPersonaCount}명</dd>
            </div>
            <div>
              <dt>실행 모델</dt>
              <dd>{result.run.modelType}</dd>
            </div>
          </dl>
          <ol className="civic-result-bars">
            {result.summary.optionResults.map((option) => (
              <li key={option.optionId}>
                <div>
                  <strong>{option.content}</strong>
                  <span>
                    {option.count}명 · {option.percentage.toFixed(1)}%
                  </span>
                </div>
                <progress
                  aria-label={`${option.content} ${option.percentage}%`}
                  max={100}
                  value={option.percentage}
                />
              </li>
            ))}
          </ol>
          <PublicSimulationEvidence engine={result.engine} />
          {result.respondents.length > 0 ? (
            <Link
              className="civic-secondary-action"
              href={
                `/admin/simulations/panel/detail?simulationId=${encodeURIComponent(simulationId)}&ordinal=1` as Route
              }
            >
              익명 패널 응답 상세 보기
            </Link>
          ) : null}
        </>
      ) : null}
      {message ? <StatusMessage>{message}</StatusMessage> : null}
    </section>
  );
}

function SimulationPanelDetail({
  query,
  simulationId,
}: Readonly<{ query: AdminQuery; simulationId: string | null }>) {
  const { message, result } = useSimulationResult(simulationId);
  const requestedOrdinal = positiveInteger(first(query.ordinal)) ?? 1;
  const respondent =
    result?.respondents.find((item) => item.panelMemberOrdinal === requestedOrdinal) ?? null;
  const selected = result?.task.question.options.find(
    (item) => item.id === respondent?.selectedOptionId,
  );
  if (!simulationId) return <MissingContext>확인할 패널 응답을 선택해 주세요.</MissingContext>;
  return (
    <section className="civic-domain-detail">
      {result && respondent ? (
        <>
          <section className="civic-domain-description">
            <h2>익명 가상 패널 {respondent.panelMemberOrdinal}</h2>
            <p>{respondent.reason ?? "응답 이유가 기록되지 않았습니다."}</p>
          </section>
          <dl className="civic-domain-impact-list">
            <div>
              <dt>선택</dt>
              <dd>{selected?.content ?? "미응답"}</dd>
            </div>
            <AnonymousPanelAttributes respondent={respondent} />
          </dl>
          <div className="civic-simulation-actions">
            {requestedOrdinal > 1 ? (
              <PanelLink
                label="이전 패널"
                ordinal={requestedOrdinal - 1}
                simulationId={simulationId}
              />
            ) : null}
            {requestedOrdinal < result.respondents.length ? (
              <PanelLink
                label="다음 패널"
                ordinal={requestedOrdinal + 1}
                simulationId={simulationId}
              />
            ) : null}
            <Link
              className="civic-secondary-action"
              href={
                `/admin/simulations/results?simulationId=${encodeURIComponent(simulationId)}` as Route
              }
            >
              집계 결과로
            </Link>
          </div>
        </>
      ) : result ? (
        <MissingContext>해당 순번의 익명 패널 응답이 없습니다.</MissingContext>
      ) : null}
      {message ? <StatusMessage>{message}</StatusMessage> : null}
    </section>
  );
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
          "실행 요청 결과가 불명확합니다. 같은 설정으로 다시 누르면 동일 요청 키를 사용합니다.",
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
          if (!capacity) throw new Error("서버의 패널 수용량 응답 형식을 확인해야 합니다.");
          if (!disposed) setResult({ capacity, signature });
        })
        .catch((error: unknown) => {
          if (!disposed)
            setMessage(
              error instanceof Error ? error.message : "패널 수용량을 확인하지 못했습니다.",
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

function SimulationCapacityCard({
  capacity,
  message,
}: Readonly<{
  capacity: SimulationCapacity | null;
  message: string;
}>) {
  if (!capacity && !message) return null;
  return (
    <section className="civic-domain-form-section civic-simulation-capacity-card">
      <header>
        <span>실행 가능 표본</span>
        <h2>패널 수용량 확인</h2>
      </header>
      {capacity ? (
        <dl className="civic-domain-impact-list">
          <div>
            <dt>요청 패널</dt>
            <dd>{capacity.requestedPersonaCount.toLocaleString("ko-KR")}명</dd>
          </div>
          <div>
            <dt>사용 가능 패널</dt>
            <dd>{capacity.availablePersonaCount.toLocaleString("ko-KR")}명</dd>
          </div>
          <div>
            <dt>허용 범위</dt>
            <dd>
              {capacity.minPersonaCount.toLocaleString("ko-KR")}–
              {capacity.maxPersonaCount.toLocaleString("ko-KR")}명
            </dd>
          </div>
        </dl>
      ) : null}
      {capacity && !capacity.canSimulate ? (
        <StatusMessage>{capacityBlockMessage(capacity)}</StatusMessage>
      ) : null}
      {message ? <StatusMessage>{message}</StatusMessage> : null}
    </section>
  );
}

function SimulationPreviewCard({
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
          <div>
            <dt>비용 근거</dt>
            <dd>{evidenceLabel(preview.evidenceSource)}</dd>
          </div>
          <div>
            <dt>완료 표본</dt>
            <dd>{preview.sampleCount.toLocaleString("ko-KR")}건</dd>
          </div>
        </dl>
      ) : null}
      {message ? <StatusMessage>{message}</StatusMessage> : null}
    </section>
  );
}

function useSimulationView(simulationId: string | null) {
  const [view, setView] = useState<SimulationView | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!simulationId) return;
    const timer = window.setTimeout(() => {
      void authenticatedFetch(`/api/v1/admin/simulations/${encodeURIComponent(simulationId)}`, {
        cache: "no-store",
      })
        .then(async (response) => {
          if (!response.ok) throw new Error(formatAdminProblem(await readAdminProblem(response)));
          const next = readSimulationView(await response.json());
          if (!next) throw new Error("서버의 실행 상태 응답 형식을 확인해야 합니다.");
          setView(next);
        })
        .catch((error: unknown) =>
          setMessage(error instanceof Error ? error.message : "실행 상태를 불러오지 못했습니다."),
        );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [simulationId]);
  return { message, view };
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
  useEffect(() => {
    if (!simulationId) return;
    const timer = window.setTimeout(() => {
      void authenticatedFetch(
        `/api/v1/admin/simulations/${encodeURIComponent(simulationId)}/results`,
        { cache: "no-store" },
      )
        .then(async (response) => {
          if (!response.ok) throw new Error(formatAdminProblem(await readAdminProblem(response)));
          const next = readSimulationResult(await response.json());
          if (!next) throw new Error("서버의 집계 결과 응답 형식을 확인해야 합니다.");
          setResult(next);
        })
        .catch((error: unknown) =>
          setMessage(error instanceof Error ? error.message : "집계 결과를 불러오지 못했습니다."),
        );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [simulationId]);
  return { message, result };
}

function TaskSnapshotCard({ task }: Readonly<{ task: TaskDetail | null }>) {
  return (
    <section className="civic-domain-description">
      <h2>{task?.task.title ?? "과업 정보 불러오는 중"}</h2>
      <p>{task?.task.question?.content ?? "Vote 과업 질문을 확인하고 있습니다."}</p>
      {task?.task.question ? (
        <ol className="civic-task-options-readonly">
          {task.task.question.options.map((option) => (
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

function PanelLink({
  label,
  ordinal,
  simulationId,
}: Readonly<{ label: string; ordinal: number; simulationId: string }>) {
  return (
    <Link
      className="civic-secondary-action"
      href={
        `/admin/simulations/panel/detail?simulationId=${encodeURIComponent(simulationId)}&ordinal=${ordinal}` as Route
      }
    >
      {label}
    </Link>
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
        과업 선택으로 돌아가기
      </Link>
    </div>
  );
}

function manualPanelHref(taskId: string, personaCount: number): Route {
  const params = new URLSearchParams({
    taskId,
    personaCount: String(personaCount),
  });
  return `/admin/simulations/panel?${params.toString()}` as Route;
}

export function buildDefaultSimulationRunInput(
  personaCount: number,
  options: SimulationOptions,
  filters?: Readonly<Record<string, readonly string[]>>,
): RunInput | null {
  if (
    !isPersonaCountWithinLimit(personaCount, options.minPersonaCount, options.maxPersonaCount) ||
    !options.defaultModel
  )
    return null;
  return {
    personaCount,
    modelType: options.defaultModel,
    sampleSeed: null,
    ...(filters === undefined ? {} : { filters }),
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

function formatKrw(value: number | undefined): string {
  return value === undefined ? "-" : `${value.toLocaleString("ko-KR")}원`;
}

function evidenceLabel(value: string): string {
  return value === "rolling_provider_cost" ? "완료 실행 이동 평균" : "초기 모델 평균";
}

function capacityBlockMessage(capacity: SimulationCapacity): string {
  if (capacity.blockReason === "PERSONA_COUNT_BELOW_MINIMUM") {
    return `페르소나 수를 ${capacity.minPersonaCount.toLocaleString("ko-KR")}명 이상으로 입력해 주세요.`;
  }
  if (capacity.blockReason === "PERSONA_COUNT_ABOVE_MAXIMUM") {
    return `페르소나 수를 ${capacity.maxPersonaCount.toLocaleString("ko-KR")}명 이하로 입력해 주세요.`;
  }
  return `현재 조건에서 사용할 수 있는 패널은 ${capacity.availablePersonaCount.toLocaleString("ko-KR")}명입니다. 성별·연령대·거주 지역·정치 성향 조건이나 요청 수를 조정해 주세요.`;
}

function simulationTargetUpdatedAt(task: SimulationTaskSummary): string {
  const latest = task.latestSimulation;
  return latest?.completedAt ?? latest?.startedAt ?? latest?.createdAt ?? task.updatedAt;
}

export function simulationStateLabel(state: SimulationState): string {
  return {
    READY: "실행 대기",
    RUNNING: "실행 중",
    WAITING_PROVIDER: "공급자 응답 대기",
    COMPLETED: "완료",
    FAILED: "실패",
    FAILED_PROVIDER: "외부 모델 호출 실패",
    REVIEW_REQUIRED: "일부 패널 응답 실패",
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
    return "일부 가상 패널 응답을 완료하지 못했습니다. 실패 패널만 다시 실행할 수 있습니다.";
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
