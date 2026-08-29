"use client";

import type { SimulationResult, SimulationResultDetail } from "@/lib/admin/simulation-contracts";
import styles from "./simulation-result-explorer.module.css";

export type SimulationResultDimension = "all" | "gender" | "ageGroup";

type DonutDatum = Readonly<{
  color: string;
  count: number;
  id: string;
  label: string;
  percentage: number;
}>;

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
      color: "#cbd3df",
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

export function filterValues(
  result: SimulationResult,
  dimension: SimulationResultDimension,
): readonly string[] {
  if (dimension === "gender") return result.availableFilters.genders;
  if (dimension === "ageGroup") return result.availableFilters.ageGroups;
  return [];
}

export function SimulationResultExplorer({
  dimension,
  detail,
  detailMessage,
  filteredValue,
  loading,
  onDimensionChange,
  onFilteredValueChange,
  onNextResult,
  onPreviousResult,
  result,
  resultIndex,
  simulationId,
}: Readonly<{
  detail: SimulationResultDetail | null;
  detailMessage: string;
  dimension: SimulationResultDimension;
  filteredValue: string | null;
  loading: boolean;
  onDimensionChange: (dimension: SimulationResultDimension) => void;
  onFilteredValueChange: (value: string | null) => void;
  onNextResult: () => void;
  onPreviousResult: () => void;
  result: SimulationResult;
  resultIndex: number;
  simulationId: string;
}>) {
  const donutData = buildDonutData(result);
  const values = filterValues(result, dimension);
  const answered = result.summary.answeredPersonaCount;
  const resultCount = result.resultSlots.length;
  const currentPosition = resultIndex >= 0 ? resultIndex + 1 : 0;
  const selectedOption = result.task.question.options.find(
    (option) => option.id === detail?.selectedOptionId,
  );
  const filterLabel =
    dimension === "all"
      ? "전체"
      : filteredValue
        ? `${dimension === "gender" ? "성별" : "연령"} · ${filteredValue}`
        : `${dimension === "gender" ? "성별" : "연령"} 전체`;

  return (
    <section aria-busy={loading} className={styles.explorer}>
      <header className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>SONA RESULT ATLAS</span>
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

      <dl aria-label="시뮬레이션 결과 요약" className={styles.metrics}>
        <div>
          <dt>요청 패널</dt>
          <dd>{result.run.personaCount.toLocaleString("ko-KR")}명</dd>
        </div>
        <div>
          <dt>현재 집계</dt>
          <dd>{result.denominators.filtered.toLocaleString("ko-KR")}명</dd>
        </div>
        <div>
          <dt>유효 응답</dt>
          <dd>{answered.toLocaleString("ko-KR")}명</dd>
        </div>
      </dl>

      <section className={styles.filterStation}>
        <div className={styles.filterCopy}>
          <span>RESULT FILTER</span>
          <h3>어떤 집단의 응답을 볼까요?</h3>
          <p>전체 결과에서 성별 또는 연령을 선택해 같은 기준으로 차트와 응답 이유를 봅니다.</p>
        </div>
        <div className={styles.filterControls}>
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
          {dimension !== "all" ? (
            <div
              aria-label={`${dimension === "gender" ? "성별" : "연령"} 결과 필터`}
              className={styles.valueFilters}
            >
              <button
                aria-pressed={filteredValue === null}
                className={filteredValue === null ? styles.activeValue : undefined}
                onClick={() => onFilteredValueChange(null)}
                type="button"
              >
                모두
              </button>
              {values.map((value) => (
                <button
                  aria-pressed={filteredValue === value}
                  className={filteredValue === value ? styles.activeValue : undefined}
                  key={value}
                  onClick={() => onFilteredValueChange(value)}
                  type="button"
                >
                  {value}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <p aria-live="polite" className={styles.filterStatus}>
          <strong>{filterLabel}</strong> 기준 ·{" "}
          {result.denominators.filtered.toLocaleString("ko-KR")}명
          {loading ? " · 다시 집계하는 중…" : ""}
        </p>
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

      <section className={styles.responseExplorer}>
        <header className={styles.responseHeader}>
          <div>
            <span>RESPONSE REASON</span>
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
            <strong>조건에 맞는 응답자가 없습니다.</strong>
            <p>필터를 ‘모두’로 바꾸거나 다른 집단을 선택해 주세요.</p>
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
