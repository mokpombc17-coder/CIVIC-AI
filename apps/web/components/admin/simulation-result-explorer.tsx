"use client";

import type { SimulationResult, SimulationResultDetail } from "@/lib/admin/simulation-contracts";
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

type DonutDatum = Readonly<{
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

const DIMENSIONS: ReadonlyArray<Readonly<{ id: SimulationResultDimension; label: string }>> = [
  { id: "all", label: "전체" },
  { id: "gender", label: "성별" },
  { id: "ageGroup", label: "연령" },
];

export function buildDonutData(result: SimulationResult): readonly DonutDatum[] {
  const values: DonutDatum[] = result.optionResults.map((option, index) => ({
    color: RESULT_COLORS[index % RESULT_COLORS.length] ?? RESULT_COLORS[0],
    count: option.count,
    id: option.optionId,
    label: option.content,
    percentage: option.percentage,
  }));
  if (result.unansweredCount > 0) {
    values.push({
      // 미응답 neutral: same value as the global --wf-line token family.
      color: "#cfd3d7",
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
  detail,
  detailMessage,
  loading,
  onDimensionChange,
  onNextResult,
  onPreviousResult,
  result,
  resultIndex,
  simulationId,
}: Readonly<{
  detail: SimulationResultDetail | null;
  detailMessage: string;
  dimension: SimulationResultDimension;
  comparisons: readonly SimulationResultComparison[];
  comparisonLoading: boolean;
  comparisonMessage: string;
  loading: boolean;
  onDimensionChange: (dimension: SimulationResultDimension) => void;
  onNextResult: () => void;
  onPreviousResult: () => void;
  result: SimulationResult;
  resultIndex: number;
  simulationId: string;
}>) {
  const donutData = buildDonutData(result);
  const resultCount = result.resultSlots.length;
  const currentPosition = resultIndex >= 0 ? resultIndex + 1 : 0;
  const selectedOption = result.task.question.options.find(
    (option) => option.id === detail?.selectedOptionId,
  );
  const dimensionLabel =
    dimension === "gender" ? "성별" : dimension === "ageGroup" ? "연령" : "전체";
  const comparisonHeading =
    dimension === "gender" ? "성별 응답을 한눈에 비교" : "연령대별 응답을 한눈에 비교";
  const insight = buildComparisonInsight(comparisons);

  return (
    <section aria-busy={loading} className={styles.explorer}>
      <header className={styles.hero}>
        <div>
          <h2>{result.task.title}</h2>
          <p>{result.task.question.content}</p>
        </div>
        <a
          className={styles.download}
          href={`/api/v1/admin/simulations/${encodeURIComponent(simulationId)}/results/export`}
        >
          <DownloadIcon />
          XLSX 내려받기
        </a>
      </header>

      <section className={styles.compareStation}>
        <div className={styles.filterCopy}>
          <h3>무엇을 기준으로 비교할까요?</h3>
          <p>전체 분포는 그대로 두고, 선택한 기준의 모든 집단을 같은 축에서 나란히 보여드립니다.</p>
        </div>
        <div className={styles.compareControls}>
          <div aria-label="응답 비교 기준" className={styles.segmented} role="group">
            {DIMENSIONS.map((item) => (
              <button
                aria-pressed={dimension === item.id}
                className={dimension === item.id ? styles.activeSegment : undefined}
                key={item.id}
                onClick={() => onDimensionChange(item.id)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
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
        <section aria-busy={comparisonLoading} className={styles.comparisonSection}>
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
                <ComparisonCard
                  comparison={comparison}
                  key={comparison.label}
                  total={result.denominators.filtered}
                />
              ))}
            </div>
          ) : comparisonLoading ? (
            <div className={styles.comparisonLoading} role="status">
              모든 집단의 응답 분포를 모으고 있습니다.
            </div>
          ) : (
            <div className={styles.emptyComparison}>
              <strong>비교할 집단 결과가 없습니다.</strong>
              <p>{comparisonMessage || "이 시뮬레이션에 기록된 집단 정보를 확인해 주세요."}</p>
            </div>
          )}
          {comparisonMessage && comparisons.length > 0 ? (
            <p className={styles.comparisonMessage} role="status">
              {comparisonMessage}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className={styles.responseExplorer}>
        <header className={styles.responseHeader}>
          <div>
            <h3>응답자가 이렇게 답한 이유</h3>
          </div>
          <nav aria-label="결과 탐색" className={styles.resultNavigation}>
            <button disabled={loading || resultIndex <= 0} onClick={onPreviousResult} type="button">
              <ChevronIcon direction="left" />
              이전 결과
            </button>
            <strong>
              {currentPosition.toLocaleString("ko-KR")} / {resultCount.toLocaleString("ko-KR")}
            </strong>
            <button
              disabled={loading || resultIndex < 0 || resultIndex >= resultCount - 1}
              onClick={onNextResult}
              type="button"
            >
              다음 결과
              <ChevronIcon direction="right" />
            </button>
          </nav>
        </header>

        {detail ? (
          <article className={styles.responseCard}>
            <div className={styles.respondentIdentity}>
              <span className={styles.avatar}>{String(detail.resultSlot).padStart(2, "0")}</span>
              <div>
                <h4>{detail.resultSlot}번 익명 가상 패널</h4>
                <div className={styles.demographics}>
                  <span>{detail.demographics.gender ?? "성별 미상"}</span>
                  <span>{detail.demographics.ageGroup ?? "연령 미상"}</span>
                </div>
              </div>
            </div>
            <div className={styles.answerReason}>
              <div>
                <span>선택한 응답</span>
                <strong>{selectedOption?.content ?? "미응답"}</strong>
              </div>
              <blockquote>
                {detail.reason?.trim() || "이 응답에는 별도의 이유가 기록되지 않았습니다."}
              </blockquote>
            </div>
          </article>
        ) : resultCount === 0 ? (
          <div className={styles.emptyReason}>
            <strong>확인할 응답 이유가 없습니다.</strong>
            <p>이 시뮬레이션에 기록된 유효 응답 수를 확인해 주세요.</p>
          </div>
        ) : (
          <div className={styles.emptyReason}>
            <strong>응답 이유를 불러오는 중입니다.</strong>
            <p>{detailMessage || "선택한 익명 패널의 응답을 확인하고 있습니다."}</p>
          </div>
        )}
      </section>
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

function DonutChart({ data, total }: Readonly<{ data: readonly DonutDatum[]; total: number }>) {
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
