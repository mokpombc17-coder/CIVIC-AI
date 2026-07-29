import { describe, expect, it } from "vitest";
import { isChatProblemDetails } from "./chat-problem-details";

const baseProblem = {
  type: "urn:hamcheeze:problem:invalid-request",
  title: "Invalid room API request",
  status: 400,
  detail: "The request body is invalid.",
  instance: "/api/v1/rooms",
  code: "INVALID_REQUEST",
  replayed: false,
  retryable: false,
};

describe("isChatProblemDetails", () => {
  it("공통 Problem Details 응답을 판별한다", () => {
    expect(isChatProblemDetails(baseProblem)).toBe(true);
  });

  it("body validation의 fieldErrors를 판별한다", () => {
    expect(
      isChatProblemDetails({
        ...baseProblem,
        fieldErrors: [
          {
            field: "visibility",
            message: "must not be null",
          },
        ],
      }),
    ).toBe(true);
  });

  it("필수 필드나 fieldErrors 형태가 잘못되면 거부한다", () => {
    expect(
      isChatProblemDetails({
        ...baseProblem,
        retryable: "false",
      }),
    ).toBe(false);
    expect(
      isChatProblemDetails({
        ...baseProblem,
        fieldErrors: [{ field: "visibility" }],
      }),
    ).toBe(false);
  });
});
