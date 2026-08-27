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
  formatAdminProblem,
  readAdminProblem,
  readTaskDetail,
  readTaskSummaries,
  type TaskDetail,
  type TaskSummary,
} from "@/lib/admin/domain-contracts";
import {
  readSimulationPreview,
  readWalletSummary,
  type SimulationPreview,
  type WalletSummary,
} from "@/lib/admin/simulation-billing-contracts";
import {
  isPersonaCountWithinLimit,
  readSimulationOptions,
  readSimulationResult,
  readSimulationView,
  type SimulationOptions,
  type SimulationResult,
  type SimulationState,
  type SimulationView,
} from "@/lib/admin/simulation-contracts";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";
import type { ScreenDefinition } from "@/lib/screens/registry";

type AdminQuery = Readonly<Record<string, string | readonly string[] | undefined>>;
type RunInput = Readonly<{
  filters?: Readonly<Record<string, readonly string[]>>;
  modelType: string;
  personaCount: number;
  sampleSeed: number | null;
}>;

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
        <BoundaryNote />
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

function BoundaryNote() {
  return (
    <aside className="civic-boundary-note">
      <strong>과업 단위 가상 패널 시뮬레이션</strong>
      <p>
        관리자가 선택한 Vote 과업에 대해 SONA 표본의 집계 응답을 생성합니다. 개별 CIVIC 사용자의
        Persona 생성이나 사용자별 예측에는 사용되지 않습니다.
      </p>
    </aside>
  );
}

function SimulationTargets() {
  const [items, setItems] = useState<readonly TaskSummary[]>([]);
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
      const tasks = readTaskSummaries(await response.json());
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
              <th>상태</th>
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
            {filtered.map((task) => (
              <tr key={task.taskId}>
                <th scope="row">{task.title}</th>
                <td>
                  <span className={`civic-domain-status is-${task.status.toLowerCase()}`}>
                    {taskStatusLabel(task.status)}
                  </span>
                </td>
                <td>{formatDate(task.updatedAt)}</td>
                <td>
                  <Link
                    className="civic-primary-action"
                    href={
                      `/admin/simulations/setup?taskId=${encodeURIComponent(task.taskId)}` as Route
                    }
                  >
                    설정하기
                  </Link>
                </td>
              </tr>
            ))}
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
  const [modelType, setModelType] = useState("");
  const [sampleSeed, setSampleSeed] = useState("");
  const [message, setMessage] = useState("");
  const { pending, start, startMessage } = useStartSimulation(taskId);
  const runInput = normalizeRunInput(personaCount, modelType, sampleSeed);
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
          setModelType(nextOptions.defaultModel);
          setPersonaCount(Math.min(30, nextOptions.maxPersonaCount));
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
    previewState.wallet.availableKrw >= previewState.preview.holdKrw,
  );

  return (
    <form
      className="civic-domain-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!runInput) return;
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
            <span>가상 패널 수</span>
            <input
              disabled={pending}
              max={options?.maxPersonaCount ?? 1}
              min={1}
              onChange={(event) => setPersonaCount(event.currentTarget.valueAsNumber)}
              required
              type="number"
              value={personaCount}
            />
            <small>현재 환경 최대 {options?.maxPersonaCount ?? "-"}명</small>
          </label>
          <label className="civic-field">
            <span>실행 모델</span>
            <select
              disabled={pending || !options}
              onChange={(event) => setModelType(event.currentTarget.value)}
              required
              value={modelType}
            >
              {options?.models.map((model) => (
                <option key={model}>{model}</option>
              ))}
            </select>
          </label>
          <label className="civic-field">
            <span>표본 시드 (선택)</span>
            <input
              disabled={pending}
              inputMode="numeric"
              onChange={(event) => setSampleSeed(event.currentTarget.value)}
              placeholder="같은 표본을 재현할 때 입력"
              type="number"
              value={sampleSeed}
            />
          </label>
        </div>
      </section>
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
          <Link className="civic-secondary-action" href={manualPanelHref(taskId, runInput)}>
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
  const modelType = first(query.modelType);
  const sampleSeedValue = first(query.sampleSeed);
  const sampleSeed =
    sampleSeedValue === null || sampleSeedValue === "" ? null : integer(sampleSeedValue);
  const personaCountAllowed = Boolean(
    options && personaCount && isPersonaCountWithinLimit(personaCount, options.maxPersonaCount),
  );
  const runInput: RunInput | null =
    taskId && personaCount && modelType && sampleSeed !== undefined && personaCountAllowed
      ? { personaCount, modelType, sampleSeed, filters }
      : null;
  const previewState = useSimulationPreview(taskId, runInput);

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

  if (!taskId || !personaCount || !modelType || sampleSeed === undefined) {
    return <MissingContext>기본 실행 설정부터 입력해 주세요.</MissingContext>;
  }

  const groups = options
    ? ([
        ["genders", "성별", options.filters.genders],
        ["age_groups", "연령대", options.filters.ageGroups],
        ["regions", "지역", options.filters.regions],
        ["political_ideologies", "정치 성향", options.filters.politicalIdeologies],
      ] as const)
    : [];

  return (
    <form
      className="civic-domain-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!runInput) return;
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
            {`가상 패널 수는 1명부터 현재 환경 최대 ${options.maxPersonaCount}명까지 입력할 수 있습니다.`}
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
      if (!disposed && (!next || ["READY", "RUNNING", "WAITING_PROVIDER"].includes(next.state))) {
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
        <span>SONA WORKER</span>
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
            {["READY", "RUNNING", "WAITING_PROVIDER"].includes(view.state) ? (
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
                {view.state === "REVIEW_REQUIRED" ? "새 표본 시드로 실행" : "실패 내용 확인"}
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
  const recoveryMessage = view ? simulationRecoveryMessage(view) : null;
  if (!simulationId) return <MissingContext>재실행할 실행을 선택해 주세요.</MissingContext>;
  return (
    <section className="civic-domain-action-panel civic-domain-danger-panel">
      <header>
        <span>수동 재실행</span>
        <h2>실패 원인을 확인한 뒤 새 설정으로 실행</h2>
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
        </dl>
      ) : null}
      {view ? (
        <Link
          className="civic-primary-action"
          href={`/admin/simulations/setup?taskId=${encodeURIComponent(view.taskId)}` as Route}
        >
          같은 과업으로 새 설정
        </Link>
      ) : null}
      {message ? <StatusMessage>{message}</StatusMessage> : null}
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
        <span>SONA AGGREGATE</span>
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
          <section className="civic-domain-form-section">
            <header>
              <span>전체 실행 검증</span>
              <h3>자료조사 · 정보처리 · Persona 응답</h3>
            </header>
            <dl className="civic-domain-impact-list">
              <div>
                <dt>응답 비율 예측</dt>
                <dd>{result.engine.calibration.answerDistributionModel}</dd>
              </div>
              <div>
                <dt>Persona 적합도 배정</dt>
                <dd>{result.engine.calibration.assignmentModel}</dd>
              </div>
              <div>
                <dt>A / B / C 배정</dt>
                <dd>
                  {result.engine.calibration.assignedInformationPracticeCounts.A} /{" "}
                  {result.engine.calibration.assignedInformationPracticeCounts.B} /{" "}
                  {result.engine.calibration.assignedInformationPracticeCounts.C}
                </dd>
              </div>
              <div>
                <dt>Naver 수집 문서</dt>
                <dd>{result.engine.externalInformation.collectedDocumentCount}건</dd>
              </div>
              <div>
                <dt>뉴스 / 블로그</dt>
                <dd>
                  {result.engine.externalInformation.documentCountsByNaverEndpoint.news} /{" "}
                  {result.engine.externalInformation.documentCountsByNaverEndpoint.blog}
                </dd>
              </div>
              <div>
                <dt>카페 / 웹문서</dt>
                <dd>
                  {result.engine.externalInformation.documentCountsByNaverEndpoint.cafearticle} /{" "}
                  {result.engine.externalInformation.documentCountsByNaverEndpoint.webkr}
                </dd>
              </div>
              <div>
                <dt>최종 Persona 응답 모델</dt>
                <dd>{result.engine.modelType ?? result.run.modelType}</dd>
              </div>
              <div>
                <dt>병렬 처리</dt>
                <dd>
                  Persona {result.engine.personaWorkers} · 내부 {result.engine.innerWorkers}
                </dd>
              </div>
            </dl>
          </section>
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
            <div>
              <dt>성별</dt>
              <dd>{respondent.demographics.gender ?? "미분류"}</dd>
            </div>
            <div>
              <dt>연령대</dt>
              <dd>{respondent.demographics.ageGroup ?? "미분류"}</dd>
            </div>
            <div>
              <dt>지역</dt>
              <dd>{respondent.demographics.region ?? "미분류"}</dd>
            </div>
            <div>
              <dt>정치 성향</dt>
              <dd>{respondent.demographics.politicalIdeology ?? "미분류"}</dd>
            </div>
            <div>
              <dt>정보 유형</dt>
              <dd>{respondent.demographics.informationType ?? "미분류"}</dd>
            </div>
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
      const body = {
        personaCount: input.personaCount,
        modelType: input.modelType,
        sampleSeed: input.sampleSeed,
        filters: input.filters ?? {},
        pricingFingerprint,
      };
      const signature = JSON.stringify(body);
      if (!requestRef.current || requestRef.current.signature !== signature) {
        requestRef.current = { key: window.crypto.randomUUID(), signature };
      }
      setPending(true);
      setMessage("");
      try {
        const response = await authenticatedFetch(
          `/api/v1/admin/tasks/${encodeURIComponent(taskId)}/simulations`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "idempotency-key": requestRef.current.key,
            },
            body: signature,
          },
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

function useSimulationPreview(taskId: string | null, input: RunInput | null) {
  const signature = input
    ? JSON.stringify({
        personaCount: input.personaCount,
        modelType: input.modelType,
        sampleSeed: input.sampleSeed,
        filters: input.filters ?? {},
      })
    : null;
  const [result, setResult] = useState<{
    preview: SimulationPreview;
    signature: string;
    wallet: WalletSummary;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const current = result?.signature === signature ? result : null;

  const load = useCallback(async () => {
    if (!taskId || !signature) return;
    setPending(true);
    setMessage("");
    try {
      const [previewResponse, walletResponse] = await Promise.all([
        authenticatedFetch(
          `/api/v1/admin/tasks/${encodeURIComponent(taskId)}/simulations/preview`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: signature,
          },
        ),
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
  }, [signature, taskId]);

  return {
    load,
    message,
    pending,
    preview: current?.preview ?? null,
    wallet: current?.wallet ?? null,
  };
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

function manualPanelHref(taskId: string, input: RunInput): Route {
  const params = new URLSearchParams({
    taskId,
    personaCount: String(input.personaCount),
    modelType: input.modelType,
  });
  if (input.sampleSeed !== null) params.set("sampleSeed", String(input.sampleSeed));
  return `/admin/simulations/panel?${params.toString()}` as Route;
}

function normalizeRunInput(personaCount: number, modelType: string, seed: string): RunInput | null {
  if (!Number.isInteger(personaCount) || personaCount < 1 || !modelType) return null;
  const parsedSeed = seed.trim() === "" ? null : integer(seed);
  return parsedSeed === undefined ? null : { personaCount, modelType, sampleSeed: parsedSeed };
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

function taskStatusLabel(status: TaskSummary["status"]): string {
  return { DRAFT: "작성 중", SCHEDULED: "예약", OPEN: "진행 중", CLOSED: "종료" }[status];
}

export function simulationStateLabel(state: SimulationState): string {
  return {
    READY: "실행 대기",
    RUNNING: "실행 중",
    WAITING_PROVIDER: "공급자 응답 대기",
    COMPLETED: "완료",
    FAILED: "실패",
    FAILED_PROVIDER: "외부 모델 호출 실패",
    REVIEW_REQUIRED: "표본 재설정 필요",
    CANCELLED: "취소됨",
  }[state];
}

export function simulationRecoveryMessage(
  view: Pick<SimulationView, "state" | "errorCode">,
): string | null {
  if (
    view.state === "REVIEW_REQUIRED" ||
    view.errorCode === "CALIBRATION_C_NETWORK_CAPACITY_INSUFFICIENT"
  ) {
    return "선택 조건에 맞는 가상 패널이 부족합니다. 조건을 조정하거나 새 표본 시드로 다시 실행하세요.";
  }
  if (view.state === "FAILED_PROVIDER" || view.errorCode === "CALIBRATION_ATTEMPTS_EXHAUSTED") {
    return "외부 모델 호출에 실패했습니다. 모델 상태를 확인한 뒤 다시 실행하세요.";
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
