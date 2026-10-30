import { describe, expect, it } from "vitest";
import { isVoteProblemDetails } from "./vote-problem-details";

describe("isVoteProblemDetails", () => {
  it("traceId와 violations가 있는 Vote Problem Detail을 인식한다", () => {
    expect(
      isVoteProblemDetails({
        type: "about:blank",
        title: "Validation failed",
        status: 422,
        detail: "invalid",
        instance: "/api/v1/me/tasks/id/submission",
        code: "TASK_SUBMISSION_VALIDATION_FAILED",
        replayed: false,
        retryable: false,
        traceId: "trace-1",
        violations: [{ code: "REQUIRED", path: "reason", message: "required" }],
      }),
    ).toBe(true);
  });

  it("v4처럼 선택 boolean 없이 question/item violation을 보내도 인식한다", () => {
    expect(
      isVoteProblemDetails({
        type: "about:blank",
        title: "Validation failed",
        status: 422,
        detail: "invalid",
        instance: "/api/v1/me/survey-responses",
        code: "SURVEY_RESPONSE_VALIDATION_FAILED",
        violations: [
          {
            code: "REQUIRED",
            field: "itemAnswers",
            questionId: "question-id",
            itemId: "item-id",
          },
        ],
      }),
    ).toBe(true);
  });

  it("problem detail 필수 필드가 없는 일반 객체를 거절한다", () => {
    expect(isVoteProblemDetails({ status: 404, code: "TASK_NOT_FOUND" })).toBe(false);
  });
});
