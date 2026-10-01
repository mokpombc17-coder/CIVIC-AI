"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatAdminProblem, readAdminProblem } from "@/lib/admin/domain-contracts";
import {
  buildVoteSimulationComparison,
  latestCompletedSimulations,
  readSimulationResult,
  readSimulationViews,
  type SimulationResult,
  type SimulationView,
} from "@/lib/admin/simulation-contracts";
import type { TaskResults } from "@/lib/admin/task-results";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";

const ACTIVE_STATES = new Set(["READY", "RUNNING", "WAITING_PROVIDER", "PUBLISHING"]);

type RunsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; runs: readonly SimulationView[] };

export function VoteSimulationComparison({
  taskId,
  vote,
}: Readonly<{ taskId: string; vote: TaskResults | null }>) {
  const [runs, setRuns] = useState<RunsState>({ status: "loading" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [simulation, setSimulation] = useState<{
    id: string;
    message: string;
    result: SimulationResult | null;
  } | null>(null);

  useEffect(() => {
    let disposed = false;
    void authenticatedFetch(`/api/v1/admin/simulations?taskId=${encodeURIComponent(taskId)}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        if (response.status === 401 || response.status === 403)
          throw new Error("시뮬레이션 조회 권한이 없어 결과를 비교할 수 없습니다.");
        if (!response.ok) throw new Error(formatAdminProblem(await readAdminProblem(response)));
        const views = readSimulationViews(await response.json());
        if (!views) throw new Error("서버의 시뮬레이션 목록 응답 형식을 확인해야 합니다.");
        if (!disposed) setRuns({ status: "ready", runs: views });
      })
      .catch((error: unknown) => {
        if (!disposed)
          setRuns({
            status: "error",
            message:
              error instanceof Error ? error.message : "시뮬레이션 목록을 불러오지 못했습니다.",
          });
      });
    return () => {
      disposed = true;
    };
  }, [taskId]);

  const completed = runs.status === "ready" ? latestCompletedSimulations(runs.runs) : [];
  const active =
    runs.status === "ready" ? runs.runs.find((run) => ACTIVE_STATES.has(run.state)) : undefined;
  const currentId = selectedId ?? completed[0]?.simulationId ?? null;

  useEffect(() => {
    if (!currentId) return;
    let disposed = false;
    void authenticatedFetch(`/api/v1/admin/simulations/${encodeURIComponent(currentId)}/results`, {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(formatAdminProblem(await readAdminProblem(response)));
        const result = readSimulationResult(await response.json());
        if (!result) throw new Error("서버의 시뮬레이션 결과 응답 형식을 확인해야 합니다.");
        if (!disposed) setSimulation({ id: currentId, message: "", result });
      })
      .catch((error: unknown) => {
        if (!disposed)
          setSimulation({
            id: currentId,
            message:
              error instanceof Error ? error.message : "시뮬레이션 결과를 불러오지 못했습니다.",
            result: null,
          });
      });
    return () => {
      disposed = true;
    };
  }, [currentId]);

  const setupHref = `/admin/simulations/setup?taskId=${encodeURIComponent(taskId)}` as Route;
  const current = simulation?.id === currentId ? simulation : null;
  const rows = vote && current?.result ? buildVoteSimulationComparison(vote, current.result) : [];

  return (
    <section aria-labelledby="vote-simulation-comparison-title" className="civic-vote-compare">
      <header>
        <div>
          <span>실제 투표 · AI 시뮬레이션</span>
          <h2 id="vote-simulation-comparison-title">투표 결과와 시뮬레이션 비교</h2>
        </div>
        {completed.length > 1 ? (
          <label className="civic-field civic-vote-compare-run">
            <span>비교할 시뮬레이션</span>
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

      {runs.status === "loading" ? (
        <p className="civic-vote-compare-note" role="status">
          이 투표로 실행한 시뮬레이션을 확인하고 있습니다.
        </p>
      ) : null}
      {runs.status === "error" ? (
        <p className="civic-vote-compare-note" role="status">
          {runs.message}
        </p>
      ) : null}

      {runs.status === "ready" && completed.length === 0 ? (
        <div className="civic-vote-compare-empty">
          <strong>
            {active ? "시뮬레이션이 진행 중입니다." : "아직 완료된 시뮬레이션이 없습니다."}
          </strong>
          <p>
            {active
              ? "완료되면 이 화면에서 실제 투표 결과와 나란히 비교할 수 있습니다."
              : "이 투표로 시뮬레이션을 실행하면 실제 투표 결과와 나란히 비교할 수 있습니다."}
          </p>
          {active ? (
            <Link
              className="wf-button wf-button-secondary"
              href={
                `/admin/simulations/status?simulationId=${encodeURIComponent(active.simulationId)}` as Route
              }
            >
              진행 상황 보기
            </Link>
          ) : (
            <Link className="civic-primary-action" href={setupHref}>
              이 투표로 시뮬레이션
            </Link>
          )}
        </div>
      ) : null}

      {current?.message ? (
        <p className="civic-vote-compare-note" role="status">
          {current.message}
        </p>
      ) : null}
      {!vote && current?.result ? (
        <p className="civic-vote-compare-note" role="status">
          실제 투표 결과를 불러오면 비교가 표시됩니다.
        </p>
      ) : null}

      {vote && current?.result ? (
        <>
          <div className="civic-vote-compare-sides">
            <article aria-label="실제 투표 결과" className="civic-vote-compare-side is-vote">
              <header>
                <h3>실제 투표</h3>
                <p>
                  {vote.responseCount.toLocaleString("ko-KR")}명 응답
                  {vote.observedAt ? " · 진행 중 집계" : ""}
                </p>
              </header>
              <ol>
                {rows.map((row) => (
                  <li key={row.optionId}>
                    <strong>{row.content}</strong>
                    <CompareBar
                      count={row.voteCount}
                      label={`${row.content} 실제 투표 비율`}
                      rate={row.voteRate}
                      tone="vote"
                    />
                  </li>
                ))}
              </ol>
            </article>
            <article
              aria-label="AI 시뮬레이션 결과"
              className="civic-vote-compare-side is-simulation"
            >
              <header>
                <h3>AI 시뮬레이션</h3>
                <p>
                  페르소나 {current.result.denominators.filtered.toLocaleString("ko-KR")}명
                  {current.result.unansweredCount > 0
                    ? ` · 미응답 ${current.result.unansweredCount.toLocaleString("ko-KR")}명`
                    : ""}
                </p>
              </header>
              <ol>
                {rows.map((row) => (
                  <li key={row.optionId}>
                    <strong>
                      {row.content}
                      <span
                        aria-label={`실제 투표 대비 ${formatDifference(row.differencePoints)}`}
                        className="civic-vote-compare-diff"
                      >
                        {formatDifference(row.differencePoints)}
                      </span>
                    </strong>
                    <CompareBar
                      count={row.simulationCount}
                      label={`${row.content} AI 시뮬레이션 비율`}
                      rate={row.simulationRate}
                      tone="simulation"
                    />
                  </li>
                ))}
              </ol>
            </article>
          </div>
          <p className="civic-vote-compare-note">
            오른쪽 %p는 AI 시뮬레이션 비율에서 실제 투표 비율을 뺀 값입니다. 생성형 AI로 만든 가상
            패널 결과이므로 참고용으로 활용해 주세요.
          </p>
          <div className="civic-form-actions">
            <Link className="wf-button wf-button-secondary" href={setupHref}>
              이 투표로 다시 시뮬레이션
            </Link>
            <Link
              className="wf-button wf-button-secondary"
              href={
                `/admin/simulations/results?simulationId=${encodeURIComponent(current.id)}` as Route
              }
            >
              시뮬레이션 응답 이유 보기
            </Link>
          </div>
        </>
      ) : null}
    </section>
  );
}

export function CompareBar({
  count,
  label,
  rate,
  tone,
}: Readonly<{ count: number; label: string; rate: number; tone: "vote" | "simulation" }>) {
  return (
    <div className={`civic-vote-compare-bar is-${tone}`}>
      <span>
        <strong>{rate.toFixed(1)}%</strong> {count.toLocaleString("ko-KR")}명
      </span>
      <progress aria-label={label} max={100} value={Math.min(rate, 100)}>
        {rate.toFixed(1)}%
      </progress>
    </div>
  );
}

export function formatDifference(points: number): string {
  const rounded = Math.round(points * 10) / 10;
  if (rounded === 0) return "0.0%p";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(1)}%p`;
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
