import { describe, expect, it } from "vitest";
import {
  createSurveyHref,
  DEFAULT_SURVEY_RETURN_PATH,
  resolveSurveyReturnPath,
} from "./survey-navigation";

describe("survey navigation", () => {
  it("설문으로 이동할 때 내부 복귀 경로를 보존한다", () => {
    expect(createSurveyHref("/vote/task-01?step=2#answer")).toBe(
      "/survey?returnTo=%2Fvote%2Ftask-01%3Fstep%3D2%23answer",
    );
  });

  it("내부 복귀 경로의 query와 hash를 복원한다", () => {
    expect(resolveSurveyReturnPath("/chat/room-01?tab=members#latest")).toBe(
      "/chat/room-01?tab=members#latest",
    );
  });

  it.each([
    undefined,
    null,
    "",
    "https://example.com/vote",
    "//example.com/vote",
    "/\\example.com/vote",
    ["/vote", "/chat"],
    "/survey",
    "/survey/step-1",
    "/login",
    "/login/callback?returnTo=/chat",
    "/signup",
    "/auth/callback",
    "/api/auth/session",
  ])("안전하지 않거나 순환하는 복귀 경로 %j는 홈으로 대체한다", (value) => {
    expect(resolveSurveyReturnPath(value)).toBe(DEFAULT_SURVEY_RETURN_PATH);
  });
});
