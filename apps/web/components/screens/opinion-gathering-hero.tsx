import { useId, type CSSProperties } from "react";

type OpinionItem = {
  /** 도넛에서 차지할 상대값입니다. 합계가 100이 아니어도 자동 정규화됩니다. */
  ratio: number;
  /** 도넛 주변에 표시할 이유 또는 관점 문구입니다. */
  label: string;
  /** 생략하면 기본 파란색 팔레트를 사용합니다. */
  color?: string;
  /** 도넛 안의 비율 글자색입니다. */
  ratioTextColor?: string;
};

type OpinionGatheringHeroProps = {
  /** false이면 SSR 초기 상태인 질문과 회색 도넛만 유지합니다. */
  animate?: boolean;
  /** 도넛을 클릭하거나 터치하면 애니메이션을 다시 재생합니다. */
  debugReplay?: boolean;
  /** 히어로 상단 질문 */
  question?: string;
  /** 라벨 순서: 왼쪽 위(주민), 오른쪽 중간(지역), 왼쪽 아래(운영) */
  items?: readonly [OpinionItem, OpinionItem, OpinionItem];
  /** @deprecated 호환용으로만 유지하며 무시됩니다. separatorWidth를 사용하세요. */
  segmentGapDegrees?: number;
  /** 흰 구분선 두께(CSS px). SVG가 확대되어도 같은 두께를 유지합니다. */
  separatorWidth?: number;
  /** 비율 표시 여부 */
  showRatios?: boolean;
  /** 바깥 반지름과 안쪽 반지름으로 도넛 두께를 조절합니다. */
  donutOuterRadius?: number;
  donutInnerRadius?: number;
  /** 질문에 추가할 클래스 */
  questionClassName?: string;
  className?: string;
  style?: CSSProperties;
};

const DEFAULT_ITEMS: readonly [OpinionItem, OpinionItem, OpinionItem] = [
  {
    label: "현행 유지",
    ratio: 20,
    color: "#d6e3ff",
    ratioTextColor: "#0054ff",
  },
  {
    label: "공통안 마련",
    ratio: 48,
    color: "#0054f5",
    ratioTextColor: "#ffffff",
  },
  {
    label: "일부 기준 통일",
    ratio: 32,
    color: "#5b92ff",
    ratioTextColor: "#ffffff",
  },
];

const FALLBACK_COLORS = ["#d6e3ff", "#0054f5", "#5b92ff"] as const;
const DONUT_CENTER_X = 180;
const DONUT_CENTER_Y = 100;
const DEFAULT_OUTER_RADIUS = 85;
const DEFAULT_INNER_RADIUS = 30.6;
// SVG 좌표계(360 × 200). 접점에서 동일한 길이의 선을 만든 후 라벨을 배치합니다.
const LABEL_LINE_GAP = 0;
const CALLOUT_HORIZONTAL_LENGTH = 20;
const CALLOUT_DIAGONAL_STEP = 10;
const CALLOUT_LAYOUT = [
  { side: "left", verticalDirection: -1, attachmentAngle: -132 },
  { side: "right", verticalDirection: -1, attachmentAngle: -4 },
  { side: "left", verticalDirection: 1, attachmentAngle: 138 },
] as const;

function getColor(index: number, color?: string) {
  return color ?? FALLBACK_COLORS[index] ?? FALLBACK_COLORS[0];
}

function heroDashStyle(length: number): CSSProperties {
  return { "--civic-hero-dash-length": `${length}` } as CSSProperties;
}

function pointOnCircle(centerX: number, centerY: number, radius: number, angleDegrees: number) {
  const angleRadians = (angleDegrees * Math.PI) / 180;

  return {
    x: centerX + radius * Math.cos(angleRadians),
    y: centerY + radius * Math.sin(angleRadians),
  };
}

/** 바깥 원호와 안쪽 원호로 닫힌 실제 도넛 조각을 만듭니다. */
function createDonutSegmentPath(
  startAngle: number,
  endAngle: number,
  outerRadius: number,
  innerRadius: number,
) {
  const outerStart = pointOnCircle(DONUT_CENTER_X, DONUT_CENTER_Y, outerRadius, startAngle);
  const outerEnd = pointOnCircle(DONUT_CENTER_X, DONUT_CENTER_Y, outerRadius, endAngle);
  const innerEnd = pointOnCircle(DONUT_CENTER_X, DONUT_CENTER_Y, innerRadius, endAngle);
  const innerStart = pointOnCircle(DONUT_CENTER_X, DONUT_CENTER_Y, innerRadius, startAngle);
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerStart.x} ${innerStart.y}`,
    "Z",
  ].join(" ");
}

export function OpinionGatheringHero({
  animate = true,
  debugReplay = false,
  question = "지역마다 다른 전남광주 환승 요금,\n어떻게 하면 좋을까요?",
  items = DEFAULT_ITEMS,
  separatorWidth = 1.5,
  showRatios = true,
  donutOuterRadius = DEFAULT_OUTER_RADIUS,
  donutInnerRadius = DEFAULT_INNER_RADIUS,
  questionClassName = "",
  className = "",
  style,
}: OpinionGatheringHeroProps) {
  const revealMaskId = `opinion-reveal-${useId().replace(/:/g, "")}`;
  const outerRadius = Number.isFinite(donutOuterRadius)
    ? Math.min(85, Math.max(1, donutOuterRadius))
    : DEFAULT_OUTER_RADIUS;
  const innerRadius = Math.min(
    Math.max(0, Number.isFinite(donutInnerRadius) ? donutInnerRadius : DEFAULT_INNER_RADIUS),
    outerRadius - 1,
  );
  const revealRadius = (outerRadius + innerRadius) / 2;
  const revealLength = 2 * Math.PI * revealRadius;
  const safeRatios = items.map(({ ratio }) => (Number.isFinite(ratio) ? Math.max(0, ratio) : 0));
  const total = safeRatios.reduce((sum, ratio) => sum + ratio, 0) || 1;
  const normalizedRatios = safeRatios.map((ratio) => (ratio / total) * 100);
  const safeSeparatorWidth = Number.isFinite(separatorWidth) ? Math.max(0, separatorWidth) : 1.5;

  let currentAngle = -90;
  // 12시부터 지역 → 운영 → 주민 순서로 그립니다. 라벨 순서와 분리합니다.
  const segments = [1, 2, 0].map((index) => {
    const ratio = normalizedRatios[index]!;
    const sweepAngle = (ratio / 100) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + sweepAngle;
    const middleAngle = currentAngle + sweepAngle / 2;
    currentAngle += sweepAngle;
    const ratioPosition = pointOnCircle(
      DONUT_CENTER_X,
      DONUT_CENTER_Y,
      (outerRadius + innerRadius) / 2,
      middleAngle,
    );

    return {
      itemIndex: index,
      separatorStart: pointOnCircle(DONUT_CENTER_X, DONUT_CENTER_Y, innerRadius, startAngle),
      separatorEnd: pointOnCircle(DONUT_CENTER_X, DONUT_CENTER_Y, outerRadius, startAngle),
      color: getColor(index, items[index]?.color),
      path: createDonutSegmentPath(startAngle, endAngle, outerRadius, innerRadius),
      ratio,
      ratioPosition,
      ratioTextColor: items[index]?.ratioTextColor ?? (index === 0 ? "#0054ff" : "#ffffff"),
    };
  });
  const visibleSegments = segments.filter(({ ratio }) => ratio > 0);
  const callouts = CALLOUT_LAYOUT.map(({ side, verticalDirection, attachmentAngle }) => {
    const direction = side === "left" ? -1 : 1;
    const contact = pointOnCircle(DONUT_CENTER_X, DONUT_CENTER_Y, outerRadius, attachmentAngle);
    const elbowX = contact.x + direction * CALLOUT_DIAGONAL_STEP;
    const y = contact.y + verticalDirection * CALLOUT_DIAGONAL_STEP;
    const lineStartX = elbowX + direction * CALLOUT_HORIZONTAL_LENGTH;
    const labelEdgeX = lineStartX + direction * LABEL_LINE_GAP;
    const pathLength =
      Math.hypot(elbowX - contact.x, y - contact.y) + Math.abs(lineStartX - elbowX);
    return {
      path: `M ${contact.x} ${contact.y} L ${elbowX} ${y} H ${lineStartX}`,
      pathLength,
      labelStyle: {
        left: `${(labelEdgeX / 360) * 100}%`,
        top: `${(y / 200) * 100}%`,
        transform: `translate(${side === "left" ? "-100%" : "0"}, -50%)`,
      } satisfies CSSProperties,
    };
  });

  const accessibleSummary = `${question} ${items
    .map(({ label }, index) => `${label} ${Math.round(normalizedRatios[index]!)}%`)
    .join(", ")}`;

  return (
    <section
      className={`civic-opinion-hero ${className}`.trim()}
      data-home-hero-animate={animate ? "true" : undefined}
      data-nosnippet=""
      style={style}
      suppressHydrationWarning
      aria-label={accessibleSummary}
    >
      <h2
        className={`civic-opinion-hero-question ${questionClassName || "civic-opinion-hero-question--default"}`.trim()}
      >
        {question}
      </h2>

      <div className="civic-opinion-hero-chart">
        <svg className="civic-opinion-hero-chart-svg" viewBox="0 0 360 200" aria-hidden="true">
          <defs>
            <mask id={revealMaskId} maskUnits="userSpaceOnUse" x="0" y="0" width="360" height="200">
              <circle
                className="civic-hero-reveal"
                cx={DONUT_CENTER_X}
                cy={DONUT_CENTER_Y}
                r={revealRadius}
                fill="none"
                stroke="white"
                strokeWidth={outerRadius - innerRadius + 2}
                strokeDasharray={`${revealLength} ${revealLength}`}
                strokeDashoffset={revealLength}
                style={heroDashStyle(revealLength)}
                transform={`rotate(-90 ${DONUT_CENTER_X} ${DONUT_CENTER_Y})`}
              />
            </mask>
          </defs>

          <circle
            cx={DONUT_CENTER_X}
            cy={DONUT_CENTER_Y}
            r={revealRadius}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth={outerRadius - innerRadius}
          />

          <g fill="none" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
            {callouts.map(({ path, pathLength }, index) => (
              <path
                key={`callout-${index}`}
                className="civic-hero-line"
                d={path}
                stroke="#0054ff"
                strokeDasharray={`${pathLength} ${pathLength}`}
                strokeDashoffset={pathLength}
                opacity={0}
                style={heroDashStyle(pathLength)}
              />
            ))}
          </g>

          <g mask={`url(#${revealMaskId})`}>
            <g>
              {visibleSegments.map(({ color, path }, index) => (
                <path key={`${color}-${index}`} d={path} fill={color} />
              ))}
            </g>

            {visibleSegments.length > 1 && safeSeparatorWidth > 0 && (
              <g
                fill="none"
                stroke="#ffffff"
                strokeWidth={safeSeparatorWidth}
                strokeLinecap="butt"
                pointerEvents="none"
              >
                {visibleSegments.map(({ itemIndex, separatorStart, separatorEnd }) => (
                  <line
                    key={`separator-${itemIndex}`}
                    x1={separatorStart.x}
                    y1={separatorStart.y}
                    x2={separatorEnd.x}
                    y2={separatorEnd.y}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </g>
            )}
          </g>

          {showRatios && (
            <g className="civic-hero-ratios" opacity={0} aria-hidden="true">
              {visibleSegments.map(({ ratio, ratioPosition, ratioTextColor }, index) => (
                <text
                  key={`ratio-${index}`}
                  x={ratioPosition.x}
                  y={ratioPosition.y}
                  fill={ratioTextColor}
                  fontSize="16"
                  fontWeight="500"
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {Math.round(ratio)}%
                </text>
              ))}
            </g>
          )}

          {animate && debugReplay ? (
            <circle
              className="civic-hero-replay"
              cx={DONUT_CENTER_X}
              cy={DONUT_CENTER_Y}
              r={revealRadius}
              fill="none"
              stroke="transparent"
              strokeWidth={outerRadius - innerRadius}
              pointerEvents="stroke"
              data-home-hero-replay=""
            />
          ) : null}
        </svg>

        <ul className="civic-opinion-hero-labels" aria-hidden="true">
          {items.map(({ label }, index) => (
            <li
              key={`${label}-${index}`}
              className="civic-hero-label"
              style={callouts[index]!.labelStyle}
            >
              {label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default OpinionGatheringHero;
