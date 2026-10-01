import { describe, expect, it } from "vitest";
import {
  buildVoteSimulationComparison,
  latestCompletedSimulations,
  readSimulationResponsePage,
  readSimulationScenario,
  validateSimulationScenarioDraft,
  type SimulationView,
} from "./simulation-contracts";

const scenarioId = "70000000-0000-4000-8000-000000000001";
const questionId = "70000000-0000-4000-8000-000000000002";
const optionA = "70000000-0000-4000-8000-00000000000a";
const optionB = "70000000-0000-4000-8000-00000000000b";

const scenario = {
  scenarioId,
  title: "도서관 운영시간",
  description: null,
  question: {
    id: questionId,
    content: "야간 운영이 필요합니까?",
    description: null,
    options: [
      { id: optionA, displayOrder: 1, content: "필요" },
      { id: optionB, displayOrder: 2, content: "불필요" },
    ],
  },
  sourceTaskId: null,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  latestSimulation: null,
};

function view(id: string, state: SimulationView["state"], createdAt: string): SimulationView {
  return {
    simulationId: id,
    taskId: scenarioId,
    state,
    personaCount: 100,
    progressPercent: state === "COMPLETED" ? 100 : 10,
    cancelRequested: false,
    errorCode: null,
    resumeAt: null,
    retryAvailableAt: null,
    waitReason: null,
    createdAt,
    startedAt: createdAt,
    completedAt: state === "COMPLETED" ? createdAt : null,
    deadlineAt: createdAt,
    estimatedCompletionAt: null,
    canCancel: false,
  };
}

describe("simulation scenario contracts", () => {
  it("시나리오 응답을 엄격하게 읽는다", () => {
    expect(readSimulationScenario(scenario)?.scenarioId).toBe(scenarioId);
    expect(readSimulationScenario({ ...scenario, internal: true })).toBeNull();
    expect(
      readSimulationScenario({
        ...scenario,
        question: { ...scenario.question, options: scenario.question.options.slice(0, 1) },
      }),
    ).toBeNull();
  });

  it("작성 초안의 제목·질문·선택지 규칙을 확인한다", () => {
    const draft = {
      title: "제목",
      description: null,
      question: {
        content: "질문",
        description: null,
        options: [{ content: "A" }, { content: "B" }],
      },
      sourceTaskId: null,
    };
    expect(validateSimulationScenarioDraft(draft)).toBeNull();
    expect(validateSimulationScenarioDraft({ ...draft, title: " " })).toBe(
      "시뮬레이션 제목을 입력해 주세요.",
    );
    expect(
      validateSimulationScenarioDraft({
        ...draft,
        question: { ...draft.question, options: [{ content: "A  B" }, { content: " A B " }] },
      }),
    ).toBe("같은 내용의 선택지는 중복해서 사용할 수 없습니다.");
    expect(
      validateSimulationScenarioDraft({
        ...draft,
        question: { ...draft.question, options: [{ content: "A" }] },
      }),
    ).toBe("선택지는 2~10개로 입력해 주세요.");
    expect(
      validateSimulationScenarioDraft({
        ...draft,
        question: { ...draft.question, options: [{ content: "A".repeat(256) }, { content: "B" }] },
      }),
    ).toBe("선택지는 255자 이하로 입력해 주세요.");
    expect(
      validateSimulationScenarioDraft({
        ...draft,
        question: { ...draft.question, content: "질".repeat(1001) },
      }),
    ).toBe("질문은 1,000자 이하로 입력해 주세요.");
  });

  it("응답 페이지 계약을 읽고 알 수 없는 필드는 거부한다", () => {
    const page = {
      schemaVersion: "CIVIC_TASK_SIMULATION_RESPONSE_PAGE_V1",
      notice: "이 결과는 생성형 AI를 사용해 생성한 가상 패널 시뮬레이션 결과입니다.",
      total: 1,
      offset: 0,
      limit: 20,
      items: [
        {
          resultSlot: 1,
          selectedOptionId: optionA,
          reason: "이유",
          demographics: { gender: "여성", ageGroup: "30대" },
        },
      ],
    };
    expect(readSimulationResponsePage(page)?.items).toHaveLength(1);
    expect(
      readSimulationResponsePage({ ...page, items: [{ ...page.items[0], personaId: "x" }] }),
    ).toBeNull();
  });

  it("실제 투표와 시뮬레이션을 선택지 ID로 맞춰 차이를 계산한다", () => {
    const rows = buildVoteSimulationComparison(
      {
        responseCount: 40,
        options: [
          { key: optionA, content: "필요", count: 30, rate: 0.75 },
          { key: optionB, content: "불필요", count: 10, rate: 0.25 },
        ],
      },
      {
        optionResults: [
          { optionId: optionB, displayOrder: 2, content: "불필요", count: 40, percentage: 40 },
          { optionId: optionA, displayOrder: 1, content: "필요", count: 60, percentage: 60 },
        ],
      },
    );
    expect(rows).toEqual([
      expect.objectContaining({
        optionId: optionA,
        voteRate: 75,
        simulationRate: 60,
        differencePoints: -15,
      }),
      expect.objectContaining({
        optionId: optionB,
        voteRate: 25,
        simulationRate: 40,
        differencePoints: 15,
      }),
    ]);
  });

  it("확정 결과의 표시 순서 키(O1)도 시뮬레이션 선택지와 맞춘다", () => {
    const simulation = {
      optionResults: [
        { optionId: optionA, displayOrder: 1, content: "필요", count: 34, percentage: 34 },
        { optionId: optionB, displayOrder: 2, content: "불필요", count: 66, percentage: 66 },
      ],
    };
    const closed = buildVoteSimulationComparison(
      {
        responseCount: 4,
        options: [
          { key: "O1", content: "필요", count: 3, rate: 0.75 },
          { key: "O2", content: "불필요", count: 1, rate: 0.25 },
        ],
      },
      simulation,
    );
    expect(closed.map((row) => row.simulationCount)).toEqual([34, 66]);
    const byOrder = buildVoteSimulationComparison(
      {
        responseCount: 4,
        options: [
          { key: "O1", content: "문구가 바뀐 선택지", count: 3, rate: 0.75 },
          { key: "O2", content: "또 다른 문구", count: 1, rate: 0.25 },
        ],
      },
      simulation,
    );
    expect(byOrder.map((row) => row.simulationRate)).toEqual([34, 66]);
  });

  it("완료된 시뮬레이션만 최신순으로 고른다", () => {
    const completed = latestCompletedSimulations([
      view("70000000-0000-4000-8000-000000000011", "COMPLETED", "2026-09-01T00:00:00Z"),
      view("70000000-0000-4000-8000-000000000012", "RUNNING", "2026-09-03T00:00:00Z"),
      view("70000000-0000-4000-8000-000000000013", "COMPLETED", "2026-09-02T00:00:00Z"),
    ]);
    expect(completed.map((item) => item.simulationId)).toEqual([
      "70000000-0000-4000-8000-000000000013",
      "70000000-0000-4000-8000-000000000011",
    ]);
  });
});
