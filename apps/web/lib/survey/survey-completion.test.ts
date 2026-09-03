import { describe, expect, it } from "vitest";
import type { SubmissionResponse } from "./survey-contracts";
import { canReturnAfterSurveySubmission } from "./survey-completion";

const persistedResult = {
  status: "SUBMITTED",
  persisted: true,
  replayed: false,
  responseId: "33333333-3333-4333-8333-333333333333",
  roundId: "11111111-1111-4111-8111-111111111111",
  contentVersionId: "22222222-2222-4222-8222-222222222222",
  submittedAt: "2026-09-03T00:00:00Z",
} satisfies SubmissionResponse;

const eligibilityBase = {
  activeRoundId: persistedResult.roundId,
  capabilities: ["VIEW_CURRENT_SURVEY"],
  evaluatedAt: "2026-09-03T00:00:01Z",
  reason: null,
  surveyRequirement: "SATISFIED",
};

describe("canReturnAfterSurveySubmission", () => {
  it("영구 제출이고 재조회한 eligibility가 true일 때만 복귀를 허용한다", () => {
    expect(
      canReturnAfterSurveySubmission(persistedResult, {
        ...eligibilityBase,
        eligible: true,
        nextAction: null,
      }),
    ).toBe(true);
    expect(
      canReturnAfterSurveySubmission(persistedResult, {
        ...eligibilityBase,
        eligible: false,
        nextAction: "COMPLETE_CURRENT_SURVEY",
      }),
    ).toBe(false);
    expect(canReturnAfterSurveySubmission(persistedResult, undefined)).toBe(false);
  });

  it("preview 검증은 eligibility와 관계없이 복귀를 허용하지 않는다", () => {
    const previewResult = {
      status: "PREVIEW_VALIDATED",
      persisted: false,
      roundId: persistedResult.roundId,
      contentVersionId: persistedResult.contentVersionId,
      validatedAt: "2026-09-03T00:00:00Z",
    } satisfies SubmissionResponse;

    expect(
      canReturnAfterSurveySubmission(previewResult, {
        ...eligibilityBase,
        eligible: true,
        nextAction: null,
      }),
    ).toBe(false);
  });
});
