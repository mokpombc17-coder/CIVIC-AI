import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SimulationResult, SimulationResultDetail } from "@/lib/admin/simulation-contracts";
import { buildDonutData, SimulationResultExplorer } from "./simulation-result-explorer";

const optionIds = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
] as const;

const result = {
  schemaVersion: "CIVIC_TASK_SIMULATION_RESULT_VIEW_V2",
  notice: "이 결과는 생성형 AI를 사용해 생성한 가상 패널 시뮬레이션 결과입니다.",
  task: {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    title: "주민참여예산 우선순위 조사",
    question: {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      content: "어떤 분야에 우선 투자해야 한다고 생각하십니까?",
      options: [
        { id: optionIds[0], displayOrder: 1, content: "생활안전 강화" },
        { id: optionIds[1], displayOrder: 2, content: "돌봄·복지 확대" },
      ],
    },
  },
  run: { personaCount: 100, modelType: "claude-sonnet-4-6", filters: {} },
  denominators: { total: 100, filtered: 100 },
  optionResults: [
    {
      optionId: optionIds[0],
      displayOrder: 1,
      content: "생활안전 강화",
      count: 45,
      percentage: 45,
    },
    {
      optionId: optionIds[1],
      displayOrder: 2,
      content: "돌봄·복지 확대",
      count: 50,
      percentage: 50,
    },
  ],
  unansweredCount: 5,
  summary: {
    totalRespondentCount: 100,
    filteredRespondentCount: 100,
    answeredPersonaCount: 95,
    unansweredPersonaCount: 5,
    optionResults: [],
  },
  availableFilters: { genders: ["남성", "여성"], ageGroups: ["20대", "30대"] },
  resultSlots: [1, 2, 3],
} satisfies SimulationResult;

const detail = {
  schemaVersion: "CIVIC_TASK_SIMULATION_SLOT_DETAIL_V1",
  notice: "이 결과는 생성형 AI를 사용해 생성한 가상 패널 시뮬레이션 결과입니다.",
  resultSlot: 1,
  selectedOptionId: optionIds[1],
  reason: "돌봄 공백을 줄이는 일이 가장 시급하다고 생각합니다.",
  demographics: { gender: "여성", ageGroup: "30대" },
} satisfies SimulationResultDetail;

describe("simulation result explorer", () => {
  it("includes unanswered responses in the doughnut denominator", () => {
    expect(buildDonutData(result)).toEqual([
      expect.objectContaining({ label: "생활안전 강화", count: 45, percentage: 45 }),
      expect.objectContaining({ label: "돌봄·복지 확대", count: 50, percentage: 50 }),
      expect.objectContaining({ label: "미응답", count: 5, percentage: 5 }),
    ]);
  });

  it("renders demographic filters, exact distribution, and the inline response reason", () => {
    const html = renderToStaticMarkup(
      <SimulationResultExplorer
        detail={detail}
        detailMessage=""
        dimension="gender"
        filteredValue={null}
        loading={false}
        onDimensionChange={vi.fn()}
        onFilteredValueChange={vi.fn()}
        onNextResult={vi.fn()}
        onPreviousResult={vi.fn()}
        result={result}
        resultIndex={0}
        simulationId="cccccccc-cccc-4ccc-8ccc-cccccccccccc"
      />,
    );

    expect(html).toContain("RESULT FILTER");
    expect(html).toContain("성별 결과 필터");
    expect(html).toContain("남성");
    expect(html).toContain("여성");
    expect(html).toContain("45.0%");
    expect(html).toContain("응답자가 이렇게 답한 이유");
    expect(html).toContain("돌봄 공백을 줄이는 일이 가장 시급하다고 생각합니다.");
    expect(html).toContain("ordinal=1");
  });
});
