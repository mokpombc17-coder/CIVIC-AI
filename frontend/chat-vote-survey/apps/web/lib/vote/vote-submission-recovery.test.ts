import { describe, expect, it } from "vitest";
import { VoteApiError } from "./vote-fetch";
import { classifyVoteSubmissionFailure } from "./vote-submission-recovery";

describe("classifyVoteSubmissionFailure", () => {
  it.each([
    ["TASK_ALREADY_SUBMITTED", "already-submitted"],
    ["TASK_SUBMISSION_OPTION_MISMATCH", "option-mismatch"],
    ["TASK_CURRENT_PERSONA_NOT_READY", "prediction-invalidated"],
    ["TASK_SUBMISSION_AI_ACCEPTANCE_NOT_AVAILABLE", "prediction-invalidated"],
    ["TASK_SUBMISSION_PREDICTION_UNAVAILABLE", "prediction-invalidated"],
    ["TASK_SUBMISSION_REASON_OPTION_MISMATCH", "prediction-invalidated"],
    ["TASK_PREDICTION_DISABLED", "prediction-invalidated"],
    ["TASK_SUBMISSION_TASK_CLOSED", "api-failure"],
  ])("%s 오류를 %s 복구 정책으로 분류한다", (code, expectedKind) => {
    expect(classifyVoteSubmissionFailure(createApiError(code))).toEqual({
      kind: expectedKind,
    });
  });

  it("Vote API 오류가 아니면 pending 제출을 보존하는 네트워크 실패로 분류한다", () => {
    expect(classifyVoteSubmissionFailure(new TypeError("network failed"))).toEqual({
      kind: "network-failure",
    });
  });
});

function createApiError(code: string): VoteApiError {
  return new VoteApiError(409, "Conflict", "http://localhost/api/v1/tasks/task/submission", {
    type: "about:blank",
    title: "Submission failed",
    status: 409,
    detail: "Submission failed",
    instance: "/api/v1/tasks/task/submission",
    code,
    retryable: false,
  });
}
