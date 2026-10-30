"use client";

import { useState } from "react";
import {
  useSimulationResponses,
  useSimulationResultComparisons,
} from "@/components/admin/admin-simulation-screen";
import {
  buildDonutData,
  DonutChart,
  resultColor,
  SimulationDimensionSwitch,
  SimulationExplorerScope,
  SimulationGroupComparisons,
  SimulationResponseTable,
  UNANSWERED_COLOR,
  type DonutDatum,
  type SimulationResultDimension,
} from "@/components/admin/simulation-result-explorer";
import { formatDifference } from "@/components/admin/vote-simulation-comparison";
import {
  summarizeVoteSimulationComparison,
  type SimulationResult,
  type VoteSimulationComparisonRow,
} from "@/lib/admin/simulation-contracts";
import type { TaskResults } from "@/lib/admin/task-results";
import styles from "./vote-simulation-analysis.module.css";

// 선택지 색은 실제 투표의 표시 순서를 기준으로 맞춰 좌우 차트에서 같은 선택지가 같은 색이 되게 한다.
export function voteDonutData(vote: TaskResults): readonly DonutDatum[] {
  return vote.options.map((option, index) => ({
    color: resultColor(index),
    count: option.count,
    id: option.key,
    label: option.content,
    percentage: option.rate * 100,
  }));
}

export function simulationDonutData(
  result: SimulationResult,
  rows: readonly VoteSimulationComparisonRow[],
): readonly DonutDatum[] {
  if (rows.length === 0) return buildDonutData(result);
  const values: DonutDatum[] = rows.map((row, index) => ({
    color: resultColor(index),
    count: row.simulationCount,
    id: row.optionId,
    label: row.content,
    percentage: row.simulationRate,
  }));
  if (result.unansweredCount > 0)
    values.push({
      color: UNANSWERED_COLOR,
      count: result.unansweredCount,
      id: "unanswered",
      label: "미응답",
      percentage:
        result.denominators.filtered > 0
          ? (result.unansweredCount / result.denominators.filtered) * 100
          : 0,
    });
  return values;
}

export function VoteSimulationSummary({
  result,
  rows,
  vote,
}: Readonly<{
  result: SimulationResult;
  rows: readonly VoteSimulationComparisonRow[];
  vote: TaskResults;
}>) {
  const summary = summarizeVoteSimulationComparison(rows);
  if (!summary) return null;
  return (
    <section aria-label="비교 요약" className={styles.summary}>
      <div className={summary.topMatches ? styles.matchCard : styles.mismatchCard}>
        <span>1위 선택지</span>
        <strong>{summary.topMatches ? "일치" : "불일치"}</strong>
        <p>
          실제 <b>{summary.voteTop.content}</b>
          {summary.topMatches ? null : (
            <>
              {" "}
              · AI <b>{summary.simulationTop.content}</b>
            </>
          )}
        </p>
      </div>
      <div>
        <span>평균 차이</span>
        <strong>{summary.meanAbsoluteDifference.toFixed(1)}%p</strong>
        <p>선택지별 비율 차이의 절댓값 평균</p>
      </div>
      <div>
        <span>가장 큰 차이</span>
        <strong>{formatDifference(summary.largestGap.differencePoints)}</strong>
        <p>{summary.largestGap.content}</p>
      </div>
      <div>
        <span>표본</span>
        <strong>
          {vote.responseCount.toLocaleString("ko-KR")} :{" "}
          {result.denominators.filtered.toLocaleString("ko-KR")}
        </strong>
        <p>실제 응답자 : AI 페르소나</p>
      </div>
    </section>
  );
}

export function ResultDonut({
  data,
  differences,
  total,
}: Readonly<{
  data: readonly DonutDatum[];
  differences?: ReadonlyMap<string, number> | undefined;
  total: number;
}>) {
  return (
    <div className={styles.chart}>
      <DonutChart data={data} total={total} />
      <ol className={styles.legend}>
        {data.map((item) => {
          const difference = differences?.get(item.id);
          return (
            <li key={item.id}>
              <span
                aria-hidden="true"
                className={styles.swatch}
                style={{ background: item.color }}
              />
              <strong>{item.label}</strong>
              <span className={styles.rate}>{item.percentage.toFixed(1)}%</span>
              <small>{item.count.toLocaleString("ko-KR")}명</small>
              {differences ? (
                <span
                  aria-label={
                    difference === undefined
                      ? undefined
                      : `실제 투표 대비 ${formatDifference(difference)}`
                  }
                  className={differenceClass(difference)}
                >
                  {difference === undefined ? "" : formatDifference(difference)}
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function VoteSimulationOptionTable({
  rows,
}: Readonly<{ rows: readonly VoteSimulationComparisonRow[] }>) {
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="vote-simulation-option-title" className={styles.section}>
      <header className={styles.sectionHeader}>
        <h3 id="vote-simulation-option-title">선택지별 비교</h3>
        <p>위 막대는 실제 투표, 아래 막대는 AI 시뮬레이션 비율입니다.</p>
      </header>
      <div className={styles.tableWrap}>
        <table className={styles.optionTable}>
          <thead>
            <tr>
              <th scope="col">선택지</th>
              <th scope="col">비율</th>
              <th scope="col">실제 투표</th>
              <th scope="col">AI 시뮬레이션</th>
              <th scope="col">차이</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.optionId}>
                <th scope="row">
                  <span
                    aria-hidden="true"
                    className={styles.swatch}
                    style={{ background: resultColor(index) }}
                  />
                  {row.content}
                </th>
                <td>
                  <div className={styles.pairedBars}>
                    <PairedBar color={resultColor(index)} label="실제" rate={row.voteRate} />
                    <PairedBar
                      color={resultColor(index)}
                      label="AI"
                      rate={row.simulationRate}
                      simulated
                    />
                  </div>
                </td>
                <td>
                  <b>{row.voteRate.toFixed(1)}%</b>
                  <small>{row.voteCount.toLocaleString("ko-KR")}명</small>
                </td>
                <td>
                  <b>{row.simulationRate.toFixed(1)}%</b>
                  <small>{row.simulationCount.toLocaleString("ko-KR")}명</small>
                </td>
                <td>
                  <span className={differenceClass(row.differencePoints)}>
                    {formatDifference(row.differencePoints)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.note}>
        차이는 AI 시뮬레이션 비율에서 실제 투표 비율을 뺀 값입니다. 생성형 AI로 만든 가상 패널
        결과이므로 참고용으로 활용해 주세요.
      </p>
    </section>
  );
}

// 회차가 바뀌면 필터·페이지를 처음부터 보도록 상위에서 simulationId를 key로 준다.
export function VoteSimulationDetails({
  result,
  simulationId,
}: Readonly<{ result: SimulationResult; simulationId: string }>) {
  const [dimension, setDimension] = useState<SimulationResultDimension>("gender");
  const groups = useSimulationResultComparisons(simulationId, result, dimension);
  const responses = useSimulationResponses(simulationId, null);
  return (
    <SimulationExplorerScope>
      <section aria-labelledby="vote-simulation-group-title" className={styles.section}>
        <header className={styles.sectionHeader}>
          <div>
            <h3 id="vote-simulation-group-title">AI 시뮬레이션 집단별 응답</h3>
            <p>실제 투표는 응답자 성별·연령을 집계하지 않아 AI 시뮬레이션만 집단별로 나눕니다.</p>
          </div>
          <SimulationDimensionSwitch dimension={dimension} onChange={setDimension} />
        </header>
        {dimension === "all" ? (
          <p className={styles.note}>성별 또는 연령을 고르면 집단별 응답 분포를 나란히 봅니다.</p>
        ) : (
          <SimulationGroupComparisons
            comparisons={groups.comparisons}
            dimension={dimension}
            loading={groups.loading}
            message={groups.message}
            total={result.denominators.filtered}
          />
        )}
      </section>
      <SimulationResponseTable responses={responses} result={result} />
    </SimulationExplorerScope>
  );
}

function PairedBar({
  color,
  label,
  rate,
  simulated = false,
}: Readonly<{ color: string; label: string; rate: number; simulated?: boolean }>) {
  return (
    <span className={styles.pairedBar}>
      <small>{label}</small>
      <span className={styles.track}>
        <i
          aria-hidden="true"
          className={simulated ? styles.simulatedFill : undefined}
          style={{ background: color, width: `${Math.min(Math.max(rate, 0), 100)}%` }}
        />
      </span>
    </span>
  );
}

function differenceClass(value: number | undefined): string {
  if (value === undefined) return styles.diff ?? "";
  const tone =
    Math.abs(value) < 5 ? styles.diffClose : value > 0 ? styles.diffOver : styles.diffUnder;
  return `${styles.diff ?? ""} ${tone ?? ""}`;
}
