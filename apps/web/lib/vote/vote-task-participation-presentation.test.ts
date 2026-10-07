import { describe, expect, it } from "vitest";
import { VoteApiError } from "./vote-fetch";
import {
  getPredictionPreparationMessage,
  getTaskSubmissionErrorMessage,
} from "./vote-task-participation-presentation";

const PREDICTION_ID = "11111111-1111-4111-8111-111111111111";

function createVoteApiError(code: string, status = 400): VoteApiError {
  return new VoteApiError(status, "Bad Request", "/api/v1/tasks/task-id/submissions", {
    type: "about:blank",
    title: "Bad Request",
    status,
    detail: "과업 제출에 실패했습니다.",
    instance: "/api/v1/tasks/task-id/submissions",
    code,
  });
}

const submissionErrorCases = [
  [401, "UNKNOWN", "로그인이 만료되었습니다. 다시 로그인해 주세요."],
  [403, "UNKNOWN", "과업을 제출할 권한이 없습니다."],
  [
    400,
    "TASK_CURRENT_PERSONA_NOT_READY",
    "과업 참여 준비가 진행 중입니다. 잠시 후 다시 시도해 주세요.",
  ],
  [
    400,
    "TASK_SUBMISSION_AI_ACCEPTANCE_NOT_AVAILABLE",
    "과업 참여 정보가 변경되었습니다. 준비가 완료된 뒤 다시 제출해 주세요.",
  ],
  [
    400,
    "TASK_SUBMISSION_PREDICTION_UNAVAILABLE",
    "과업 참여 정보가 변경되었습니다. 준비가 완료된 뒤 다시 제출해 주세요.",
  ],
  [
    400,
    "TASK_SUBMISSION_REASON_OPTION_MISMATCH",
    "과업 참여 정보가 변경되었습니다. 준비가 완료된 뒤 다시 제출해 주세요.",
  ],
  [
    400,
    "TASK_PREDICTION_DISABLED",
    "AI 예상 이유를 사용할 수 없습니다. 직접 작성 가능 여부를 다시 확인해 주세요.",
  ],
  [
    400,
    "TASK_SUBMISSION_OPTION_MISMATCH",
    "선택지가 변경되었습니다. 과업 내용을 다시 확인해 주세요.",
  ],
  [
    400,
    "TASK_SUBMISSION_TASK_CLOSED",
    "현재 제출할 수 없는 과업입니다. 과업 목록을 다시 확인해 주세요.",
  ],
  [
    400,
    "TASK_SUBMISSION_TASK_UNPUBLISHED",
    "현재 제출할 수 없는 과업입니다. 과업 목록을 다시 확인해 주세요.",
  ],
  [
    400,
    "TASK_SUBMISSION_TASK_UNAVAILABLE",
    "현재 제출할 수 없는 과업입니다. 과업 목록을 다시 확인해 주세요.",
  ],
  [400, "TASK_SUBMISSION_REASON_REQUIRED", "응답 이유를 입력해 주세요."],
  [400, "TASK_SUBMISSION_REASON_TOO_LONG", "응답 이유는 500자 이하로 입력해 주세요."],
  [400, "TASK_SUBMISSION_VALIDATION_FAILED", "선택한 응답과 이유를 다시 확인해 주세요."],
  [400, "IDEMPOTENCY_CONFLICT", "제출 내용을 다시 확인한 뒤 재시도해 주세요."],
] as const;

describe("Vote Task participation presentation", () => {
  it.each(submissionErrorCases)(
    "%s 응답의 %s 제출 오류를 사용자 안내로 변환한다",
    (status, code, message) => {
      expect(getTaskSubmissionErrorMessage(createVoteApiError(code, status))).toBe(message);
    },
  );

  it("알 수 없는 제출 오류는 같은 내용으로 재시도하도록 안내한다", () => {
    const message = "제출 결과를 확인하지 못했습니다. 같은 내용으로 다시 시도해 주세요.";

    expect(getTaskSubmissionErrorMessage(createVoteApiError("UNKNOWN"))).toBe(message);
    expect(getTaskSubmissionErrorMessage(new Error("network unavailable"))).toBe(message);
  });

  it("이미 제출한 상태를 다른 준비 오류보다 우선 안내한다", () => {
    expect(
      getPredictionPreparationMessage({
        alreadySubmitted: true,
        view: undefined,
        predictionError: new Error("ignored"),
        ensureError: null,
        ensurePending: false,
      }),
    ).toBe("이미 참여한 투표입니다.");
  });

  it("Prediction 조회와 생성 오류를 같은 준비 실패 안내로 표시한다", () => {
    const expected = "투표 참여 정보를 준비하지 못했습니다. 잠시 후 다시 접속해 주세요.";
    const base = {
      alreadySubmitted: false,
      view: undefined,
      ensurePending: false,
    };

    expect(
      getPredictionPreparationMessage({
        ...base,
        predictionError: new Error("query failed"),
        ensureError: null,
      }),
    ).toBe(expected);
    expect(
      getPredictionPreparationMessage({
        ...base,
        predictionError: null,
        ensureError: new Error("ensure failed"),
      }),
    ).toBe(expected);
  });

  it("서버의 Prediction 대기 안내와 최대 대기시간을 보존한다", () => {
    expect(
      getPredictionPreparationMessage({
        alreadySubmitted: false,
        view: {
          state: "REMOTE_PROCESSING",
          predictionId: PREDICTION_ID,
          predictionRequestAllowed: false,
          runtimeStatus: {
            code: "PREDICTION_NOT_READY",
            detail: "AI 예상 이유를 준비 중입니다.",
            retryable: true,
            maxWaitMinutes: 10,
          },
          submissionAllowed: false,
          waiting: true,
        },
        predictionError: null,
        ensureError: null,
        ensurePending: false,
      }),
    ).toBe("AI 예상 이유를 준비 중입니다.\n최대 예상 대기시간은 10분입니다.");
  });

  it("Prediction 최종 실패와 참여 불가 상태를 구분해 안내한다", () => {
    const baseView = {
      predictionId: PREDICTION_ID,
      predictionRequestAllowed: false,
      runtimeStatus: null,
      submissionAllowed: false,
      waiting: false,
    } as const;
    const input = {
      alreadySubmitted: false,
      predictionError: null,
      ensureError: null,
      ensurePending: false,
    } as const;

    expect(
      getPredictionPreparationMessage({ ...input, view: { ...baseView, state: "FAILED" } }),
    ).toBe("AI 예상 답변을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    expect(
      getPredictionPreparationMessage({ ...input, view: { ...baseView, state: "TASK_CLOSED" } }),
    ).toBe("현재 응답을 작성할 수 없습니다.");
  });

  it("참여 가능 상태와 준비 중인 중간 상태에는 별도 오류를 표시하지 않는다", () => {
    const input = {
      alreadySubmitted: false,
      predictionError: null,
      ensureError: null,
    } as const;

    expect(
      getPredictionPreparationMessage({
        ...input,
        view: {
          state: "SUCCEEDED",
          predictionId: PREDICTION_ID,
          predictionRequestAllowed: false,
          runtimeStatus: null,
          submissionAllowed: true,
          waiting: false,
        },
        ensurePending: false,
      }),
    ).toBeNull();
    expect(
      getPredictionPreparationMessage({
        ...input,
        view: undefined,
        ensurePending: false,
      }),
    ).toBeNull();
    expect(
      getPredictionPreparationMessage({
        ...input,
        view: {
          state: "NOT_REQUESTED",
          predictionId: null,
          predictionRequestAllowed: false,
          runtimeStatus: null,
          submissionAllowed: false,
          waiting: false,
        },
        ensurePending: true,
      }),
    ).toBeNull();
    expect(
      getPredictionPreparationMessage({
        ...input,
        view: {
          state: "NOT_REQUESTED",
          predictionId: null,
          predictionRequestAllowed: true,
          runtimeStatus: null,
          submissionAllowed: false,
          waiting: false,
        },
        ensurePending: false,
      }),
    ).toBeNull();
  });
});
