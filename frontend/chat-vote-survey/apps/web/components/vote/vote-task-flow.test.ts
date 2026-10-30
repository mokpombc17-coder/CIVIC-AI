import { describe, expect, it } from "vitest";
import {
  createVoteTaskFlowState,
  reduceVoteTaskFlow,
  type VoteTaskFlowState,
} from "./vote-task-flow";

describe("reduceVoteTaskFlow", () => {
  it("새 선택지를 고르면 이전 이유와 입력 오류를 초기화한다", () => {
    const state = createState({
      directReason: "기존 이유",
      directReasonError: "기존 오류",
      reasonChoice: { kind: "USER_WRITTEN" },
      selectedOptionId: "option-a",
    });

    expect(
      reduceVoteTaskFlow(state, { type: "option-chosen", optionId: "option-b" }),
    ).toMatchObject({
      directReason: "",
      directReasonError: null,
      reasonChoice: null,
      selectedOptionId: "option-b",
    });
  });

  it("선택한 선택지를 다시 고르면 선택을 해제한다", () => {
    const state = createState({ selectedOptionId: "option-a" });

    expect(
      reduceVoteTaskFlow(state, { type: "option-chosen", optionId: "option-a" }).selectedOptionId,
    ).toBeNull();
  });

  it("동일한 추천 이유를 다시 고르면 이유 선택을 해제한다", () => {
    const choice = { kind: "AI_ACCEPTED", predictedReasonId: "reason-a" } as const;
    const state = createState({ reasonChoice: choice });

    expect(reduceVoteTaskFlow(state, { type: "reason-chosen", choice }).reasonChoice).toBeNull();
  });

  it("직접 입력이 비어 있으면 확인 단계로 이동하지 않는다", () => {
    const state = createState({
      directReason: "   ",
      reasonChoice: { kind: "USER_WRITTEN" },
      selectedOptionId: "option-a",
      step: 2,
    });

    expect(
      reduceVoteTaskFlow(state, { type: "confirmation-requested", reasonReady: false }),
    ).toMatchObject({
      directReasonError: "응답 이유를 입력해 주세요.",
      step: 2,
    });
  });

  it("직접 입력이 500자를 넘으면 확인 단계로 이동하지 않는다", () => {
    const state = createState({
      directReason: "가".repeat(501),
      reasonChoice: { kind: "USER_WRITTEN" },
      selectedOptionId: "option-a",
      step: 2,
    });

    expect(
      reduceVoteTaskFlow(state, { type: "confirmation-requested", reasonReady: false }),
    ).toMatchObject({
      directReasonError: "응답 이유는 500자 이하로 입력해 주세요.",
      step: 2,
    });
  });

  it("유효한 응답이면 확인 단계로 이동한다", () => {
    const state = createState({
      directReason: "직접 작성한 이유",
      reasonChoice: { kind: "USER_WRITTEN" },
      selectedOptionId: "option-a",
      step: 2,
    });

    expect(
      reduceVoteTaskFlow(state, { type: "confirmation-requested", reasonReady: true }).step,
    ).toBe(3);
  });

  it("제출 성공 시 복구 항목을 지우고 완료 단계로 이동한다", () => {
    const pending = {
      taskId: "task-a",
      idempotencyKey: "idempotency-key",
      command: {
        selectedOptionId: "option-a",
        reasonSource: "USER_WRITTEN" as const,
        reason: "직접 작성한 이유",
      },
    };
    const state = createState({ recoverableSubmission: pending, step: 3 });

    expect(reduceVoteTaskFlow(state, { type: "submission-completed" })).toMatchObject({
      recoverableSubmission: null,
      step: 4,
    });
  });
});

function createState(patch: Partial<VoteTaskFlowState> = {}): VoteTaskFlowState {
  return { ...createVoteTaskFlowState(null), ...patch };
}
