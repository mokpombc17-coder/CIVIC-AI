"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SimulationSetup } from "@/components/admin/admin-simulation-screen";
import {
  loadSimulationTarget,
  type SimulationTarget,
} from "@/components/admin/simulation-scenario-panels";
import {
  ResultDonut,
  simulationDonutData,
  VoteSimulationDetails,
  VoteSimulationOptionTable,
  VoteSimulationSummary,
  voteDonutData,
} from "@/components/admin/vote-simulation-analysis";
import { ScreenFrame } from "@/components/screens/screen-frame";
import { formatSimulationProblem, readAdminProblem } from "@/lib/admin/domain-contracts";
import { errorMessage } from "@/lib/user-facing-message";
import {
  buildVoteSimulationComparison,
  latestCompletedSimulations,
  readSimulationResult,
  readSimulationViews,
  type SimulationResult,
  type SimulationView,
} from "@/lib/admin/simulation-contracts";
import { loadTaskResults, type TaskResults } from "@/lib/admin/task-results";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";
import type { ScreenDefinition } from "@/lib/screens/registry";

const ACTIVE_STATES = new Set(["READY", "RUNNING", "WAITING_PROVIDER", "PUBLISHING"]);
const RUN_POLL_MS = 5_000;

type VoteState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; result: TaskResults };

type RunsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; runs: readonly SimulationView[] };

export function AdminVoteSimulationScreen({
  screen,
  taskId,
}: Readonly<{ screen: ScreenDefinition; taskId: string | null }>) {
  return (
    <ScreenFrame
      backHref={"/admin/simulations" as Route}
      screen={screen}
      title="투표 기반 시뮬레이션"
    >
      <div
        className="civic-admin-workbench civic-domain-console civic-simulation-console"
        data-wireflow-layout="simulation-results"
      >
        {taskId ? (
          <VoteSimulationWorkspace key={taskId} taskId={taskId} />
        ) : (
          <div className="civic-domain-empty">
            <p>시뮬레이션할 투표를 선택해 주세요.</p>
            <Link className="civic-primary-action" href={"/admin/simulations" as Route}>
              시뮬레이션 목록으로 돌아가기
            </Link>
          </div>
        )}
      </div>
    </ScreenFrame>
  );
}

// REVIEW_REQUIRED는 일부 페르소나 응답이 실패해 관리자 처리가 필요한 실행이다. 서버는 마감까지
// 관리자당 하나뿐인 실행 자리를 계속 잡아 두므로 끝난 실행처럼 숨기지 않는다.
export function reviewRequiredSimulation(runs: readonly SimulationView[]): SimulationView | null {
  return (
    runs
      .filter((run) => run.state === "REVIEW_REQUIRED")
      .toSorted((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0] ??
    null
  );
}

export function activeSimulation(runs: readonly SimulationView[]): SimulationView | null {
  return (
    runs
      .filter((run) => ACTIVE_STATES.has(run.state))
      .toSorted((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0] ??
    null
  );
}

function VoteSimulationWorkspace({ taskId }: Readonly<{ taskId: string }>) {
  const [target, setTarget] = useState<SimulationTarget | null>(null);
  const [vote, setVote] = useState<VoteState>({ status: "loading" });
  const [voteRevision, setVoteRevision] = useState(0);
  const [runs, setRuns] = useState<RunsState>({ status: "loading" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [simulation, setSimulation] = useState<{
    id: string;
    message: string;
    result: SimulationResult | null;
  } | null>(null);

  useEffect(() => {
    let disposed = false;
    void loadSimulationTarget(taskId)
      .then((next) => {
        if (!disposed) setTarget(next);
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
    };
  }, [taskId]);

  useEffect(() => {
    const controller = new AbortController();
    void loadTaskResults(taskId, authenticatedFetch, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setVote({ status: "ready", result });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setVote({
            status: "error",
            message:
              error instanceof Error && !(error instanceof TypeError)
                ? error.message
                : "네트워크 오류로 투표 결과를 불러오지 못했습니다.",
          });
      });
    return () => controller.abort();
  }, [taskId, voteRevision]);

  const loadRuns = useCallback(async () => {
    try {
      const response = await authenticatedFetch(
        `/api/v1/admin/simulations?taskId=${encodeURIComponent(taskId)}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error(formatSimulationProblem(await readAdminProblem(response)));
      const views = readSimulationViews(await response.json());
      if (!views) throw new Error("서버의 시뮬레이션 목록 응답 형식을 확인해야 합니다.");
      setRuns({ status: "ready", runs: views });
    } catch (error) {
      // 폴링 중 일시 오류는 직전 이력을 유지해 진행 중 실행 추적이 끊기지 않게 한다.
      setRuns((current) =>
        current.status === "ready"
          ? current
          : {
              status: "error",
              message: errorMessage(error, "시뮬레이션 목록을 불러오지 못했습니다."),
            },
      );
    }
  }, [taskId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadRuns(), 0);
    return () => window.clearTimeout(timer);
  }, [loadRuns]);

  const allRuns = runs.status === "ready" ? runs.runs : [];
  const active = activeSimulation(allRuns);
  const review = active ? null : reviewRequiredSimulation(allRuns);
  const completed = latestCompletedSimulations(allRuns);
  const currentId = selectedId ?? completed[0]?.simulationId ?? null;

  // 진행 중이거나 확인이 필요한 실행이 있으면 상태가 바뀔 때까지 이력을 다시 읽어 결과를 이어 붙인다.
  const watching = Boolean(active ?? review);
  useEffect(() => {
    if (!watching) return;
    const timer = window.setInterval(() => void loadRuns(), RUN_POLL_MS);
    return () => window.clearInterval(timer);
  }, [watching, loadRuns]);

  useEffect(() => {
    if (!currentId) return;
    let disposed = false;
    void authenticatedFetch(`/api/v1/admin/simulations/${encodeURIComponent(currentId)}/results`, {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(formatSimulationProblem(await readAdminProblem(response)));
        const result = readSimulationResult(await response.json());
        if (!result) throw new Error("서버의 시뮬레이션 결과 응답 형식을 확인해야 합니다.");
        if (!disposed) setSimulation({ id: currentId, message: "", result });
      })
      .catch((error: unknown) => {
        if (!disposed)
          setSimulation({
            id: currentId,
            message: errorMessage(error, "시뮬레이션 결과를 불러오지 못했습니다."),
            result: null,
          });
      });
    return () => {
      disposed = true;
    };
  }, [currentId]);

  const onStarted = useCallback(
    (view: SimulationView) => {
      setRuns((current) => ({
        status: "ready",
        runs: [view, ...(current.status === "ready" ? current.runs : [])],
      }));
      void loadRuns();
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [loadRuns],
  );

  const voteResult = vote.status === "ready" ? vote.result : null;
  const current = simulation?.id === currentId ? simulation : null;
  const rows =
    voteResult && current?.result ? buildVoteSimulationComparison(voteResult, current.result) : [];
  const title =
    target?.title ??
    voteResult?.task.title ??
    current?.result?.task.title ??
    "투표 정보 불러오는 중";
  const question =
    target?.question ||
    voteResult?.task.question?.content ||
    current?.result?.task.question.content;

  return (
    <div className="civic-vote-simulation-workspace">
      <header className="civic-vote-simulation-heading">
        <div>
          <span>투표 기반 시뮬레이션</span>
          <h2>{title}</h2>
          {question ? <p>{question}</p> : null}
        </div>
        <Link
          className="wf-button wf-button-secondary"
          href={`/admin/tasks/detail?taskId=${encodeURIComponent(taskId)}` as Route}
        >
          투표 관리에서 보기
        </Link>
      </header>

      {voteResult && current?.result ? (
        <VoteSimulationSummary result={current.result} rows={rows} vote={voteResult} />
      ) : null}

      <div className="civic-vote-compare-sides civic-vote-simulation-sides">
        <article aria-label="실제 투표 결과" className="civic-vote-compare-side is-vote">
          <header>
            <h3>실제 투표</h3>
            <p>
              {voteResult
                ? `${voteResult.responseCount.toLocaleString("ko-KR")}명 응답${
                    voteResult.observedAt ? " · 진행 중 집계" : " · 확정 결과"
                  }`
                : vote.status === "loading"
                  ? "투표 결과를 불러오고 있습니다."
                  : "투표 결과를 표시할 수 없습니다."}
            </p>
          </header>
          {voteResult ? (
            <ResultDonut data={voteDonutData(voteResult)} total={voteResult.responseCount} />
          ) : vote.status === "error" ? (
            <p className="civic-vote-compare-note" role="status">
              {vote.message}
            </p>
          ) : null}
          {voteResult?.observedAt ? (
            <button
              className="wf-button wf-button-secondary"
              onClick={() => setVoteRevision((value) => value + 1)}
              type="button"
            >
              현황 새로고침
            </button>
          ) : null}
        </article>

        <article aria-label="AI 시뮬레이션 결과" className="civic-vote-compare-side is-simulation">
          <header className="civic-vote-simulation-side-heading">
            <div>
              <h3>AI 시뮬레이션</h3>
              <p>
                {current?.result
                  ? `페르소나 ${current.result.denominators.filtered.toLocaleString("ko-KR")}명`
                  : runs.status === "loading"
                    ? "실행 이력을 확인하고 있습니다."
                    : "완료된 결과가 없습니다."}
              </p>
            </div>
            {completed.length > 1 ? (
              <label className="civic-field civic-vote-compare-run">
                <span>회차</span>
                <select
                  onChange={(event) => setSelectedId(event.currentTarget.value)}
                  value={currentId ?? ""}
                >
                  {completed.map((run) => (
                    <option key={run.simulationId} value={run.simulationId}>
                      {formatDate(run.completedAt ?? run.createdAt)} · 페르소나{" "}
                      {run.personaCount.toLocaleString("ko-KR")}명
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </header>

          {active ? (
            <div className="civic-vote-simulation-progress" role="status">
              <span>
                새 실행 진행 중 · {active.progressPercent}% · 페르소나{" "}
                {active.personaCount.toLocaleString("ko-KR")}명
              </span>
              <progress aria-label="시뮬레이션 진행률" max={100} value={active.progressPercent} />
              <Link
                href={
                  `/admin/simulations/status?simulationId=${encodeURIComponent(active.simulationId)}` as Route
                }
              >
                진행 상황 자세히
              </Link>
            </div>
          ) : null}

          {review ? (
            <div className="civic-vote-simulation-progress" role="status">
              <span>일부 페르소나 응답이 실패해 확인이 필요합니다.</span>
              <Link
                href={
                  `/admin/simulations/status?simulationId=${encodeURIComponent(review.simulationId)}` as Route
                }
              >
                상태 확인
              </Link>
            </div>
          ) : null}

          {current?.result ? (
            <ResultDonut
              data={simulationDonutData(current.result, rows)}
              differences={
                rows.length > 0
                  ? new Map(rows.map((row) => [row.optionId, row.differencePoints]))
                  : undefined
              }
              total={current.result.denominators.filtered}
            />
          ) : runs.status === "ready" && !active && !review ? (
            <p className="civic-vote-compare-note">
              아직 실행한 시뮬레이션이 없습니다. 아래에서 바로 실행할 수 있습니다.
            </p>
          ) : null}
          {current?.message ? (
            <p className="civic-vote-compare-note" role="status">
              {current.message}
            </p>
          ) : null}
          {runs.status === "error" ? (
            <p className="civic-vote-compare-note" role="status">
              {runs.message}
            </p>
          ) : null}
          {current?.result ? (
            <Link
              className="wf-button wf-button-secondary"
              href={
                `/admin/simulations/results?simulationId=${encodeURIComponent(current.id)}` as Route
              }
            >
              시뮬레이션 결과 화면에서 보기
            </Link>
          ) : null}
        </article>
      </div>
      <VoteSimulationOptionTable rows={rows} />
      {current?.result ? (
        <VoteSimulationDetails key={current.id} result={current.result} simulationId={current.id} />
      ) : null}

      <section aria-labelledby="vote-simulation-run-title" className="civic-vote-simulation-run">
        <header>
          <h2 id="vote-simulation-run-title">
            {completed.length > 0 || active || review ? "다시 실행" : "시뮬레이션 실행"}
          </h2>
          <p>페르소나 수와 조건을 정하고 예상 비용을 확인한 뒤 바로 실행합니다.</p>
        </header>
        <SimulationSetup
          hideTarget
          onStarted={onStarted}
          query={{}}
          runBlockedReason={
            active
              ? "진행 중인 시뮬레이션이 끝나면 다시 실행할 수 있습니다."
              : review
                ? "확인이 필요한 시뮬레이션을 처리한 뒤 다시 실행할 수 있습니다."
                : null
          }
          taskId={taskId}
        />
      </section>
    </div>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat("ko-KR", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Seoul",
      }).format(date);
}
