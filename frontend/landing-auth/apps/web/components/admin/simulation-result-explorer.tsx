"use client";

import type { ReactNode } from "react";
import {
  UNANSWERED_OPTION_FILTER,
  type SimulationResponsePage,
  type SimulationResult,
} from "@/lib/admin/simulation-contracts";
import styles from "./simulation-result-explorer.module.css";

export type SimulationResultDimension = "all" | "gender" | "ageGroup";

export type SimulationResultComparison = Readonly<{
  label: string;
  result: SimulationResult;
}>;

export type SimulationResultComparisonInsight = Readonly<{
  difference: number;
  highestGroup: string;
  lowestGroup: string;
  optionLabel: string;
}>;

export type SimulationResponseFilters = Readonly<{
  ageGroup: string | null;
  gender: string | null;
  optionId: string | null;
}>;

export const SIMULATION_RESPONSE_PAGE_SIZE = 20;

export type SimulationResponsesView = Readonly<{
  filters: SimulationResponseFilters;
  highlightSlot: number | null;
  loading: boolean;
  message: string;
  offset: number;
  onFiltersChange: (filters: SimulationResponseFilters) => void;
  onOffsetChange: (offset: number) => void;
  page: SimulationResponsePage | null;
}>;

export type DonutDatum = Readonly<{
  color: string;
  count: number;
  id: string;
  label: string;
  percentage: number;
}>;

// Data-viz palette. Segment colors stay as literals on purpose; the module CSS
// exposes the matching sky accents as --chart-1..--chart-5.
const RESULT_COLORS = [
  "#2563eb",
  "#f0643b",
  "#14a879",
  "#e8a21a",
  "#d84f83",
  "#6f5ad5",
  "#1595ad",
  "#9b6b43",
] as const;

// 미응답 neutral: same value as the global --wf-line token family.
export const UNANSWERED_COLOR = "#cfd3d7";

const DIMENSIONS: ReadonlyArray<Readonly<{ id: SimulationResultDimension; label: string }>> = [
  { id: "all", label: "전체" },
  { id: "gender", label: "성별" },
  { id: "ageGroup", label: "연령" },
];

export function resultColor(index: number): string {
  return RESULT_COLORS[index % RESULT_COLORS.length] ?? RESULT_COLORS[0];
}

export function buildDonutData(result: SimulationResult): readonly DonutDatum[] {
  const values: DonutDatum[] = result.optionResults.map((option, index) => ({
    color: resultColor(index),
    count: option.count,
    id: option.optionId,
    label: option.content,
    percentage: option.percentage,
  }));
  if (result.unansweredCount > 0) {
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
  }
  return values;
}

export function buildComparisonInsight(
  comparisons: readonly SimulationResultComparison[],
): SimulationResultComparisonInsight | null {
  if (comparisons.length < 2) return null;
  const options = comparisons[0]?.result.optionResults ?? [];
  const candidates = options.flatMap((option) => {
    const values = comparisons.flatMap((comparison) => {
      const match = comparison.result.optionResults.find(
        (candidate) => candidate.optionId === option.optionId,
      );
      return match ? [{ group: comparison.label, percentage: match.percentage }] : [];
    });
    if (values.length < 2) return [];
    const highest = values.reduce((current, candidate) =>
      candidate.percentage > current.percentage ? candidate : current,
    );
    const lowest = values.reduce((current, candidate) =>
      candidate.percentage < current.percentage ? candidate : current,
    );
    return [
      {
        difference: highest.percentage - lowest.percentage,
        highestGroup: highest.group,
        lowestGroup: lowest.group,
        optionLabel: option.content,
      },
    ];
  });
  return (
    candidates.reduce<SimulationResultComparisonInsight | null>(
      (largest, candidate) =>
        !largest || candidate.difference > largest.difference ? candidate : largest,
      null,
    ) ?? null
  );
}

export function SimulationResultExplorer({
  dimension,
  comparisons,
  comparisonLoading,
  comparisonMessage,
  headerAction,
  loading,
  onDimensionChange,
  responses,
  result,
  simulationId,
}: Readonly<{
  dimension: SimulationResultDimension;
  comparisons: readonly SimulationResultComparison[];
  comparisonLoading: boolean;
  comparisonMessage: string;
  headerAction?: ReactNode;
  loading: boolean;
  onDimensionChange: (dimension: SimulationResultDimension) => void;
  responses: SimulationResponsesView;
  result: SimulationResult;
  simulationId: string;
}>) {
  const donutData = buildDonutData(result);
  const dimensionLabel =
    dimension === "gender" ? "성별" : dimension === "ageGroup" ? "연령" : "전체";

  return (
    <section aria-busy={loading} className={styles.explorer}>
      <header className={styles.hero}>
        <div>
          <h2>{result.task.title}</h2>
          <p>{result.task.question.content}</p>
        </div>
        <div className={styles.heroActions}>
          {headerAction}
          <a
            className={styles.download}
            href={`/api/v1/admin/simulations/${encodeURIComponent(simulationId)}/results/export`}
          >
            <DownloadIcon />
            XLSX 내려받기
          </a>
        </div>
      </header>

      <section className={styles.compareStation}>
        <div className={styles.filterCopy}>
          <h3>무엇을 기준으로 비교할까요?</h3>
          <p>전체 분포는 그대로 두고, 선택한 기준의 모든 집단을 같은 축에서 나란히 보여드립니다.</p>
        </div>
        <div className={styles.compareControls}>
          <SimulationDimensionSwitch dimension={dimension} onChange={onDimensionChange} />
          <p aria-live="polite" className={styles.compareStatus}>
            <strong>{dimensionLabel}</strong>
            {dimension === "all"
              ? " 응답 분포를 보고 있습니다."
              : comparisonLoading && comparisons.length === 0
                ? " 기준의 모든 집단을 불러오고 있습니다."
                : ` 기준의 ${comparisons.length}개 집단을 한 번에 비교합니다.`}
            {comparisonLoading && comparisons.length > 0 ? " · 비교 결과를 갱신하는 중…" : ""}
          </p>
        </div>
      </section>

      <section className={styles.questionResult}>
        <header className={styles.questionHeader}>
          <span>Q1</span>
          <div>
            <h3>{result.task.question.content}</h3>
            <p>{result.denominators.filtered.toLocaleString("ko-KR")}명 기준 응답 분포</p>
          </div>
        </header>
        <div className={styles.chartCard}>
          <DonutChart data={donutData} total={result.denominators.filtered} />
          <ol className={styles.legend}>
            {donutData.map((item, index) => (
              <li key={item.id}>
                <span
                  aria-hidden="true"
                  className={styles.swatch}
                  style={{ background: item.color }}
                />
                <span className={styles.optionNumber}>
                  {item.id === "unanswered" ? "—" : String(index + 1).padStart(2, "0")}
                </span>
                <strong>{item.label}</strong>
                <span>{item.percentage.toFixed(1)}%</span>
                <small>{item.count.toLocaleString("ko-KR")}명</small>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {dimension !== "all" ? (
        <SimulationGroupComparisons
          comparisons={comparisons}
          dimension={dimension}
          loading={comparisonLoading}
          message={comparisonMessage}
          total={result.denominators.filtered}
        />
      ) : null}

      <SimulationResponseTable responses={responses} result={result} />
    </section>
  );
}

// 집단 비교·응답 표는 .explorer에 정의한 차트 토큰을 쓰므로 다른 화면에서도 이 범위 안에 둔다.
export function SimulationExplorerScope({ children }: Readonly<{ children: ReactNode }>) {
  return <div className={styles.explorer}>{children}</div>;
}

export function SimulationDimensionSwitch({
  dimension,
  onChange,
}: Readonly<{
  dimension: SimulationResultDimension;
  onChange: (dimension: SimulationResultDimension) => void;
}>) {
  return (
    <div aria-label="응답 비교 기준" className={styles.segmented} role="group">
      {DIMENSIONS.map((item) => (
        <button
          aria-pressed={dimension === item.id}
          className={dimension === item.id ? styles.activeSegment : undefined}
          key={item.id}
          onClick={() => onChange(item.id)}
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function SimulationGroupComparisons({
  comparisons,
  dimension,
  loading,
  message,
  total,
}: Readonly<{
  comparisons: readonly SimulationResultComparison[];
  dimension: Exclude<SimulationResultDimension, "all">;
  loading: boolean;
  message: string;
  total: number;
}>) {
  const dimensionLabel = dimension === "gender" ? "성별" : "연령";
  const comparisonHeading =
    dimension === "gender" ? "성별 응답을 한눈에 비교" : "연령대별 응답을 한눈에 비교";
  const insight = buildComparisonInsight(comparisons);
  return (
    <section aria-busy={loading} className={styles.comparisonSection}>
      <header className={styles.comparisonHeader}>
        <div>
          <h3>{comparisonHeading}</h3>
        </div>
        <p>막대 길이는 각 집단 안에서 해당 응답을 선택한 비율입니다.</p>
      </header>

      {insight && insight.difference > 0 ? (
        <div className={styles.insight}>
          <span aria-hidden="true">↗</span>
          <div>
            <strong>집단 간 가장 큰 차이</strong>
            <p>
              <b>{insight.highestGroup}</b>의 ‘{insight.optionLabel}’ 응답이{" "}
              <b>{insight.lowestGroup}</b>보다 {insight.difference.toFixed(1)}%p 높습니다.
            </p>
          </div>
        </div>
      ) : null}

      {comparisons.length > 0 ? (
        <div
          aria-label={`${dimensionLabel} 기준 집단별 응답 비교`}
          className={styles.comparisonGrid}
        >
          {comparisons.map((comparison) => (
            <ComparisonCard comparison={comparison} key={comparison.label} total={total} />
          ))}
        </div>
      ) : loading ? (
        <div className={styles.comparisonLoading} role="status">
          모든 집단의 응답 분포를 모으고 있습니다.
        </div>
      ) : (
        <div className={styles.emptyComparison}>
          <strong>비교할 집단 결과가 없습니다.</strong>
          <p>{message || "이 시뮬레이션에 기록된 집단 정보를 확인해 주세요."}</p>
        </div>
      )}
      {message && comparisons.length > 0 ? (
        <p className={styles.comparisonMessage} role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}

export function SimulationResponseTable({
  responses,
  result,
}: Readonly<{ responses: SimulationResponsesView; result: SimulationResult }>) {
  const { filters, page, offset } = responses;
  const options = result.task.question.options;
  const optionLabel = (optionId: string | null) =>
    options.find((option) => option.id === optionId)?.content ?? "미응답";
  const total = page?.total ?? 0;
  const pageSize = page?.limit ?? SIMULATION_RESPONSE_PAGE_SIZE;
  const currentPage = total === 0 ? 0 : Math.floor(offset / pageSize) + 1;
  const pageCount = Math.ceil(total / pageSize);
  const change = (patch: Partial<SimulationResponseFilters>) =>
    responses.onFiltersChange({ ...filters, ...patch });

  return (
    <section aria-busy={responses.loading} className={styles.responseExplorer}>
      <header className={styles.responseHeader}>
        <div>
          <h3>응답자가 이렇게 답한 이유</h3>
          <p>
            {page
              ? `${total.toLocaleString("ko-KR")}명 중 ${
                  total === 0 ? 0 : (offset + 1).toLocaleString("ko-KR")
                }–${Math.min(offset + pageSize, total).toLocaleString("ko-KR")}번째`
              : "응답 목록을 불러오고 있습니다."}
          </p>
        </div>
        <div aria-label="응답 목록 필터" className={styles.responseFilters} role="group">
          <label>
            <span>선택 응답</span>
            <select
              onChange={(event) => change({ optionId: event.currentTarget.value || null })}
              value={filters.optionId ?? ""}
            >
              <option value="">전체</option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.content}
                </option>
              ))}
              <option value={UNANSWERED_OPTION_FILTER}>미응답</option>
            </select>
          </label>
          <label>
            <span>성별</span>
            <select
              onChange={(event) => change({ gender: event.currentTarget.value || null })}
              value={filters.gender ?? ""}
            >
              <option value="">전체</option>
              {result.availableFilters.genders.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>연령</span>
            <select
              onChange={(event) => change({ ageGroup: event.currentTarget.value || null })}
              value={filters.ageGroup ?? ""}
            >
              <option value="">전체</option>
              {result.availableFilters.ageGroups.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {page && page.items.length > 0 ? (
        <div className={styles.responseTableWrap}>
          <table className={styles.responseTable}>
            <thead>
              <tr>
                <th scope="col">번호</th>
                <th scope="col">성별</th>
                <th scope="col">연령</th>
                <th scope="col">선택 응답</th>
                <th scope="col">응답 이유</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((item) => (
                <tr
                  aria-current={item.resultSlot === responses.highlightSlot ? "true" : undefined}
                  key={item.resultSlot}
                >
                  <td>{item.resultSlot}</td>
                  <td>{item.demographics.gender ?? "미상"}</td>
                  <td>{item.demographics.ageGroup ?? "미상"}</td>
                  <td>
                    <strong>{optionLabel(item.selectedOptionId)}</strong>
                  </td>
                  <td>{item.reason?.trim() || "기록된 이유가 없습니다."}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={styles.emptyReason}>
          <strong>
            {page ? "조건에 맞는 응답이 없습니다." : "응답 목록을 불러오는 중입니다."}
          </strong>
          {responses.message ? <p>{responses.message}</p> : null}
        </div>
      )}
      {page && responses.message ? (
        <p className={styles.comparisonMessage} role="status">
          {responses.message}
        </p>
      ) : null}

      {pageCount > 1 ? (
        <nav aria-label="응답 목록 페이지" className={styles.resultNavigation}>
          <button
            disabled={responses.loading || offset <= 0}
            onClick={() => responses.onOffsetChange(Math.max(offset - pageSize, 0))}
            type="button"
          >
            <ChevronIcon direction="left" />
            이전
          </button>
          <strong>
            {currentPage.toLocaleString("ko-KR")} / {pageCount.toLocaleString("ko-KR")} 페이지
          </strong>
          <button
            disabled={responses.loading || offset + pageSize >= total}
            onClick={() => responses.onOffsetChange(offset + pageSize)}
            type="button"
          >
            다음
            <ChevronIcon direction="right" />
          </button>
        </nav>
      ) : null}
    </section>
  );
}

function ComparisonCard({
  comparison,
  total,
}: Readonly<{ comparison: SimulationResultComparison; total: number }>) {
  const data = buildDonutData(comparison.result);
  const groupCount = comparison.result.denominators.filtered;
  const share = total > 0 ? (groupCount / total) * 100 : 0;
  return (
    <article className={styles.comparisonCard}>
      <header>
        <h4>{comparison.label}</h4>
        <p>
          <strong>{groupCount.toLocaleString("ko-KR")}명</strong>
          <span>전체의 {share.toFixed(1)}%</span>
        </p>
      </header>
      <ol>
        {data.map((item, index) => (
          <li
            aria-label={`${item.label}: ${item.count.toLocaleString("ko-KR")}명, ${item.percentage.toFixed(1)}%`}
            key={item.id}
          >
            <span className={styles.comparisonKey}>
              <i aria-hidden="true" style={{ background: item.color }} />
              {item.id === "unanswered" ? "—" : String(index + 1).padStart(2, "0")}
            </span>
            <span className={styles.comparisonTrack}>
              <i
                aria-hidden="true"
                style={{ background: item.color, width: `${Math.min(item.percentage, 100)}%` }}
              />
            </span>
            <span className={styles.comparisonValue}>
              <b>{item.count.toLocaleString("ko-KR")}명</b>
              {item.percentage.toFixed(1)}%
            </span>
          </li>
        ))}
      </ol>
    </article>
  );
}

export function DonutChart({
  data,
  total,
}: Readonly<{ data: readonly DonutDatum[]; total: number }>) {
  const radius = 47;
  const circumference = 2 * Math.PI * radius;
  const segments = data.map((item, index) => {
    const accumulated = data
      .slice(0, index)
      .reduce((sum, previous) => sum + previous.percentage, 0);
    return {
      ...item,
      length: (item.percentage / 100) * circumference,
      offset: -(accumulated / 100) * circumference,
    };
  });
  const label = data
    .map((item) => `${item.label} ${item.count}명 ${item.percentage.toFixed(1)}%`)
    .join(", ");

  return (
    <figure aria-label={label || "응답 없음"} className={styles.donut} role="img">
      <svg aria-hidden="true" viewBox="0 0 120 120">
        <circle className={styles.donutTrack} cx="60" cy="60" fill="none" r={radius} />
        {segments.map((item) => (
          <circle
            cx="60"
            cy="60"
            fill="none"
            key={item.id}
            r={radius}
            stroke={item.color}
            strokeDasharray={`${item.length} ${Math.max(circumference - item.length, 0)}`}
            strokeDashoffset={item.offset}
          />
        ))}
      </svg>
      <figcaption>
        <strong>{total.toLocaleString("ko-KR")}</strong>
        <span>명 기준</span>
      </figcaption>
    </figure>
  );
}

function ChevronIcon({ direction }: Readonly<{ direction: "left" | "right" }>) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d={direction === "left" ? "m10 3-5 5 5 5" : "m6 3 5 5-5 5"} />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="M10 2v10m0 0 4-4m-4 4L6 8M3 15v2h14v-2" />
    </svg>
  );
}
