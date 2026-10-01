"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ConsoleDataGrid, type ConsoleColumn } from "@/components/admin/console/console-data-grid";
import { ConsoleModal } from "@/components/admin/console/console-modal";
import { ConsoleBadge, ConsoleSearchControl } from "@/components/admin/console/console-ui";
import {
  formatAdminProblem,
  readAdminProblem,
  readTaskDetail,
  type TaskSummary,
} from "@/lib/admin/domain-contracts";
import {
  readSimulationScenario,
  readSimulationScenarios,
  readSimulationTaskSummaries,
  simulationTargetHref,
  simulationTargetPresentation,
  validateSimulationScenarioDraft,
  type SimulationScenario,
  type SimulationState,
  type SimulationTaskSummary,
} from "@/lib/admin/simulation-contracts";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";

export type SimulationTarget = Readonly<{
  kind: "vote" | "scenario";
  id: string;
  title: string;
  question: string;
  options: readonly Readonly<{ id: string; content: string }>[];
}>;

// 직접 작성한 시뮬레이션과 투표는 같은 taskId 자리를 공유하므로 시나리오를 먼저 확인한다.
export async function loadSimulationTarget(
  targetId: string,
  request: typeof fetch = authenticatedFetch,
): Promise<SimulationTarget> {
  const encoded = encodeURIComponent(targetId);
  const scenarioResponse = await request(`/api/v1/admin/simulation-scenarios/${encoded}`, {
    cache: "no-store",
  });
  if (scenarioResponse.ok) {
    const scenario = readSimulationScenario(await scenarioResponse.json());
    if (!scenario) throw new Error("서버의 시뮬레이션 응답 형식을 확인해야 합니다.");
    return {
      kind: "scenario",
      id: scenario.scenarioId,
      title: scenario.title,
      question: scenario.question.content,
      options: scenario.question.options.map(({ id, content }) => ({ id, content })),
    };
  }
  if (scenarioResponse.status !== 404) {
    throw new Error(formatAdminProblem(await readAdminProblem(scenarioResponse)));
  }
  const voteResponse = await request(`/api/v1/admin/simulation-tasks/${encoded}`, {
    cache: "no-store",
  });
  if (!voteResponse.ok) throw new Error(formatAdminProblem(await readAdminProblem(voteResponse)));
  const detail = readTaskDetail(await voteResponse.json());
  if (!detail) throw new Error("서버의 투표 응답 형식을 확인해야 합니다.");
  return {
    kind: "vote",
    id: detail.task.id,
    title: detail.task.title,
    question: detail.task.question?.content ?? "",
    options: [...(detail.task.question?.options ?? [])]
      .sort((left, right) => left.displayOrder - right.displayOrder)
      .map(({ id, content }) => ({ id, content })),
  };
}

type ScenarioRow = Readonly<{
  scenarioId: string;
  title: string;
  stateLabel: string;
  stateTone: "neutral" | "active" | "danger" | "success";
  updatedLabel: string;
  href: string;
}>;

const SCENARIO_GRID_COLUMNS: ReadonlyArray<ConsoleColumn<ScenarioRow>> = [
  { field: "title", headerName: "시뮬레이션 제목", flex: 2, minWidth: 200 },
  {
    field: "stateLabel",
    headerName: "진행 상태",
    minWidth: 150,
    cellRenderer: (params: Readonly<{ data?: ScenarioRow }>) =>
      params.data ? (
        <span className="civic-simulation-state-cell">
          <ConsoleBadge tone={params.data.stateTone}>{params.data.stateLabel}</ConsoleBadge>
        </span>
      ) : null,
  },
  { field: "updatedLabel", headerName: "최근 변경", minWidth: 150 },
];

export function scenarioRow(scenario: SimulationScenario): ScenarioRow {
  const state = scenario.latestSimulation?.state ?? null;
  const presentation = simulationTargetPresentation(state);
  return {
    scenarioId: scenario.scenarioId,
    title: scenario.title,
    stateLabel: state === null ? "미실행" : presentation.label,
    stateTone: scenarioStateTone(state),
    updatedLabel: formatDate(scenario.latestSimulation?.createdAt ?? scenario.updatedAt),
    href: simulationTargetHref(scenario.scenarioId, scenario.latestSimulation),
  };
}

function scenarioStateTone(state: SimulationState | null): ScenarioRow["stateTone"] {
  if (state === null) return "neutral";
  const tone = simulationTargetPresentation(state).tone;
  return tone === "completed"
    ? "success"
    : tone === "running"
      ? "active"
      : tone === "attention"
        ? "danger"
        : "neutral";
}

type VoteSimulationRow = Readonly<{
  taskId: string;
  title: string;
  stateLabel: string;
  stateTone: ScenarioRow["stateTone"];
  updatedLabel: string;
  href: string;
}>;

const VOTE_SIMULATION_GRID_COLUMNS: ReadonlyArray<ConsoleColumn<VoteSimulationRow>> = [
  { field: "title", headerName: "투표 제목", flex: 2, minWidth: 200 },
  {
    field: "stateLabel",
    headerName: "최근 실행 상태",
    minWidth: 150,
    cellRenderer: (params: Readonly<{ data?: VoteSimulationRow }>) =>
      params.data ? (
        <span className="civic-simulation-state-cell">
          <ConsoleBadge tone={params.data.stateTone}>{params.data.stateLabel}</ConsoleBadge>
        </span>
      ) : null,
  },
  { field: "updatedLabel", headerName: "최근 실행", minWidth: 150 },
];

// 투표 기반 결과는 투표 결과 탭에서 실제 투표와 나란히 본다.
export function voteSimulationRow(task: SimulationTaskSummary): VoteSimulationRow | null {
  const latest = task.latestSimulation;
  if (!latest) return null;
  const presentation = simulationTargetPresentation(latest.state);
  return {
    taskId: task.taskId,
    title: task.title,
    stateLabel: presentation.label,
    stateTone: scenarioStateTone(latest.state),
    updatedLabel: formatDate(latest.completedAt ?? latest.startedAt ?? latest.createdAt),
    href:
      presentation.target === "results"
        ? `/admin/tasks/results?taskId=${encodeURIComponent(task.taskId)}`
        : simulationTargetHref(task.taskId, latest),
  };
}

function useListLoader<T>(path: string, read: (value: unknown) => readonly T[] | null) {
  const [items, setItems] = useState<readonly T[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await authenticatedFetch(path, { cache: "no-store" });
      if (!response.ok) return setMessage(formatAdminProblem(await readAdminProblem(response)));
      const next = read(await response.json());
      if (!next) return setMessage("서버의 목록 응답 형식을 확인해야 합니다.");
      setItems(next);
      setMessage("");
    } catch {
      setMessage("네트워크 오류로 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [path, read]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  return { items, loading, message, reload: load };
}

function matches(title: string, keyword: string): boolean {
  const normalized = keyword.trim().toLocaleLowerCase("ko-KR");
  return !normalized || title.toLocaleLowerCase("ko-KR").includes(normalized);
}

export function SimulationLists() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const scenarios = useListLoader("/api/v1/admin/simulation-scenarios", readSimulationScenarios);
  const votes = useListLoader("/api/v1/admin/simulation-tasks", readSimulationTaskSummaries);

  const voteRows = useMemo(
    () =>
      votes.items
        .filter((task) => matches(task.title, search))
        .flatMap((task) => voteSimulationRow(task) ?? []),
    [search, votes.items],
  );
  const scenarioRows = useMemo(
    () => scenarios.items.filter((item) => matches(item.title, search)).map(scenarioRow),
    [scenarios.items, search],
  );

  return (
    <>
      <form
        className="civic-domain-toolbar civic-simulation-toolbar console-toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          void scenarios.reload();
          void votes.reload();
        }}
        role="search"
      >
        <ConsoleSearchControl
          ariaLabel="시뮬레이션 검색"
          onChange={setSearch}
          placeholder="투표 또는 시뮬레이션 제목을 검색해 주세요."
          value={search}
        />
      </form>

      <section
        aria-labelledby="vote-simulation-list-title"
        className="civic-simulation-list-section"
      >
        <header>
          <div>
            <h2 id="vote-simulation-list-title">투표 기반 시뮬레이션</h2>
            <p>
              투표 상세에서 실행한 시뮬레이션입니다. 완료된 결과는 투표 결과 탭에서 실제 투표와
              좌우로 비교합니다.
            </p>
          </div>
          <span>{voteRows.length.toLocaleString("ko-KR")}건</span>
        </header>
        <ConsoleDataGrid
          ariaLabel="투표 기반 시뮬레이션 목록"
          columnDefs={VOTE_SIMULATION_GRID_COLUMNS}
          emptyText={
            votes.loading
              ? "투표 기반 시뮬레이션을 불러오는 중입니다."
              : "아직 투표로 실행한 시뮬레이션이 없습니다. 투표 상세에서 실행할 수 있습니다."
          }
          getRowId={(row) => row.taskId}
          height={280}
          onRowClicked={(row) => router.push(row.href as Route)}
          rowData={voteRows}
        />
        {votes.message ? (
          <p aria-live="polite" className="civic-domain-empty" role="status">
            {votes.message}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="simulation-list-title" className="civic-simulation-list-section">
        <header>
          <div>
            <h2 id="simulation-list-title">시뮬레이션</h2>
            <p>투표 없이 질문과 선택지를 직접 작성한 시뮬레이션입니다.</p>
          </div>
          <button
            className="civic-primary-action civic-simulation-create-action"
            onClick={() => router.push("/admin/simulations/setup" as Route)}
            type="button"
          >
            새 시뮬레이션 만들기
          </button>
        </header>
        <ConsoleDataGrid
          ariaLabel="시뮬레이션 목록"
          columnDefs={SCENARIO_GRID_COLUMNS}
          emptyText={
            scenarios.loading
              ? "시뮬레이션을 불러오는 중입니다."
              : "아직 만든 시뮬레이션이 없습니다. 새 시뮬레이션을 만들어 주세요."
          }
          getRowId={(row) => row.scenarioId}
          height={280}
          onRowClicked={(row) => router.push(row.href as Route)}
          rowData={scenarioRows}
        />
        {scenarios.message ? (
          <p aria-live="polite" className="civic-domain-empty" role="status">
            {scenarios.message}
          </p>
        ) : null}
      </section>
    </>
  );
}

type DraftOption = Readonly<{ key: string; content: string }>;

export function SimulationScenarioEditor() {
  const router = useRouter();
  const nextKey = useRef(2);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [question, setQuestion] = useState("");
  const [questionDescription, setQuestionDescription] = useState("");
  const [options, setOptions] = useState<readonly DraftOption[]>([
    { key: "option-0", content: "" },
    { key: "option-1", content: "" },
  ]);
  const [sourceTaskId, setSourceTaskId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  function newOption(content: string): DraftOption {
    return { key: `option-${nextKey.current++}`, content };
  }

  async function importVote(task: TaskSummary) {
    setImportOpen(false);
    setMessage("");
    try {
      const response = await authenticatedFetch(
        `/api/v1/admin/simulation-tasks/${encodeURIComponent(task.taskId)}`,
        { cache: "no-store" },
      );
      if (!response.ok) return setMessage(formatAdminProblem(await readAdminProblem(response)));
      const detail = readTaskDetail(await response.json());
      if (!detail?.task.question) {
        return setMessage("질문이 작성된 투표만 불러올 수 있습니다.");
      }
      setTitle(detail.task.title);
      setDescription(detail.task.description ?? "");
      setQuestion(detail.task.question.content);
      setQuestionDescription(detail.task.question.description ?? "");
      setOptions(
        [...detail.task.question.options]
          .sort((left, right) => left.displayOrder - right.displayOrder)
          .map((option) => newOption(option.content)),
      );
      setSourceTaskId(detail.task.id);
      setMessage(
        `‘${detail.task.title}’ 투표 내용을 불러왔습니다. 원본 투표와는 연결되지 않습니다.`,
      );
    } catch {
      setMessage("네트워크 오류로 투표 내용을 불러오지 못했습니다.");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const draft = {
      title: title.trim(),
      description: description.trim() || null,
      question: {
        content: question.trim(),
        description: questionDescription.trim() || null,
        options: options.map((option) => ({ content: option.content.trim() })),
      },
      sourceTaskId,
    };
    const validation = validateSimulationScenarioDraft(draft);
    if (validation) return setMessage(validation);
    setPending(true);
    setMessage("");
    try {
      const response = await authenticatedFetch("/api/v1/admin/simulation-scenarios", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!response.ok) return setMessage(formatAdminProblem(await readAdminProblem(response)));
      const created = readSimulationScenario(await response.json());
      if (!created) return setMessage("서버의 시뮬레이션 저장 응답 형식을 확인해야 합니다.");
      router.push(
        `/admin/simulations/setup?taskId=${encodeURIComponent(created.scenarioId)}` as Route,
      );
    } catch {
      setMessage("저장 결과가 불명확합니다. 시뮬레이션 목록에서 저장 여부를 확인해 주세요.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="civic-domain-form civic-simulation-scenario-editor" onSubmit={submit}>
      <section className="civic-domain-form-section">
        <header className="civic-simulation-scenario-heading">
          <div>
            <span>새 시뮬레이션</span>
            <h2>질문과 선택지</h2>
          </div>
          <button
            className="wf-button wf-button-secondary"
            disabled={pending}
            onClick={() => setImportOpen(true)}
            type="button"
          >
            투표에서 불러오기
          </button>
        </header>
        <label className="civic-field">
          <span>제목</span>
          <input
            disabled={pending}
            maxLength={200}
            onChange={(event) => setTitle(event.currentTarget.value)}
            required
            value={title}
          />
        </label>
        <label className="civic-field">
          <span>배경 (선택)</span>
          <textarea
            disabled={pending}
            maxLength={2000}
            onChange={(event) => setDescription(event.currentTarget.value)}
            rows={3}
            value={description}
          />
        </label>
        <label className="civic-field">
          <span>질문</span>
          <textarea
            disabled={pending}
            maxLength={1000}
            onChange={(event) => setQuestion(event.currentTarget.value)}
            required
            rows={3}
            value={question}
          />
        </label>
        <label className="civic-field">
          <span>질문 설명 (선택)</span>
          <textarea
            disabled={pending}
            maxLength={2000}
            onChange={(event) => setQuestionDescription(event.currentTarget.value)}
            rows={2}
            value={questionDescription}
          />
        </label>
      </section>
      <section className="civic-domain-form-section">
        <header>
          <span>단일 선택 · 2~10개</span>
          <h2>응답 선택지</h2>
        </header>
        <ol className="civic-option-builder">
          {options.map((option, index) => (
            <li key={option.key}>
              <label className="civic-field">
                <span>선택지 {index + 1}</span>
                <input
                  disabled={pending}
                  maxLength={255}
                  onChange={(event) => {
                    const content = event.currentTarget.value;
                    setOptions((current) =>
                      current.map((item) =>
                        item.key === option.key ? { ...item, content } : item,
                      ),
                    );
                  }}
                  required
                  value={option.content}
                />
              </label>
              <button
                disabled={pending || options.length <= 2}
                onClick={() =>
                  setOptions((current) => current.filter((item) => item.key !== option.key))
                }
                type="button"
              >
                삭제
              </button>
            </li>
          ))}
        </ol>
        <button
          className="wf-button wf-button-secondary"
          disabled={pending || options.length >= 10}
          onClick={() => setOptions((current) => [...current, newOption("")])}
          type="button"
        >
          선택지 추가
        </button>
      </section>
      <div className="civic-form-actions">
        <button
          className="wf-button wf-button-secondary"
          disabled={pending}
          onClick={() => router.push("/admin/simulations" as Route)}
          type="button"
        >
          취소
        </button>
        <button className="civic-primary-action" disabled={pending} type="submit">
          {pending ? "저장 중…" : "저장하고 실행 설정으로"}
        </button>
      </div>
      {message ? (
        <p aria-live="polite" className="civic-form-message" role="status">
          {message}
        </p>
      ) : null}
      <VoteImportDialog
        onClose={() => setImportOpen(false)}
        onSelect={(task) => void importVote(task)}
        open={importOpen}
      />
    </form>
  );
}

const VOTE_IMPORT_COLUMNS: ReadonlyArray<ConsoleColumn<TaskSummary>> = [
  { field: "title", headerName: "투표 제목", flex: 2, minWidth: 180 },
  {
    headerName: "상태",
    minWidth: 100,
    valueGetter: (params) =>
      params.data
        ? { DRAFT: "작성 중", SCHEDULED: "예약", OPEN: "진행 중", CLOSED: "종료" }[
            params.data.status
          ]
        : "",
  },
];

function VoteImportDialog({
  open,
  onClose,
  onSelect,
}: Readonly<{ open: boolean; onClose: () => void; onSelect: (task: TaskSummary) => void }>) {
  const [items, setItems] = useState<readonly TaskSummary[] | null>(null);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open || items) return;
    let disposed = false;
    void authenticatedFetch("/api/v1/admin/simulation-tasks", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(formatAdminProblem(await readAdminProblem(response)));
        const tasks = readSimulationTaskSummaries(await response.json());
        if (!tasks) throw new Error("서버의 투표 목록 응답 형식을 확인해야 합니다.");
        if (!disposed) setItems(tasks);
      })
      .catch((error: unknown) => {
        if (!disposed)
          setMessage(error instanceof Error ? error.message : "투표 목록을 불러오지 못했습니다.");
      });
    return () => {
      disposed = true;
    };
  }, [items, open]);

  const rows = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase("ko-KR");
    return (items ?? []).filter(
      (item) => !normalized || item.title.toLocaleLowerCase("ko-KR").includes(normalized),
    );
  }, [items, search]);

  return (
    <ConsoleModal ariaLabel="투표에서 불러오기" onClose={onClose} open={open}>
      <div className="civic-vote-import-dialog">
        <header>
          <h2>투표에서 불러오기</h2>
          <p>선택한 투표의 제목·질문·선택지를 복사합니다. 원본 투표는 바뀌지 않습니다.</p>
        </header>
        <ConsoleSearchControl
          ariaLabel="불러올 투표 검색"
          onChange={setSearch}
          placeholder="투표 제목을 검색해 주세요."
          value={search}
        />
        <ConsoleDataGrid
          ariaLabel="불러올 투표 목록"
          columnDefs={VOTE_IMPORT_COLUMNS}
          emptyText={items ? "조건에 맞는 투표가 없습니다." : "투표를 불러오는 중입니다."}
          getRowId={(task) => task.taskId}
          height={320}
          onRowClicked={onSelect}
          rowData={rows}
        />
        {message ? (
          <p aria-live="polite" className="civic-form-message" role="status">
            {message}
          </p>
        ) : null}
        <div className="civic-form-actions">
          <button className="wf-button wf-button-secondary" onClick={onClose} type="button">
            닫기
          </button>
        </div>
      </div>
    </ConsoleModal>
  );
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat("ko-KR", {
        dateStyle: "medium",
        timeStyle: "medium",
        timeZone: "Asia/Seoul",
      }).format(date);
}
