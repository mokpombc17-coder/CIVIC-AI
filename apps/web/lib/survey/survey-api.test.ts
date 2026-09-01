import { describe, expect, it, vi } from "vitest";
import { createSurveyApi } from "./survey-api";
import type { SubmitSurveyRequest } from "./survey-contracts";
import {
  currentSurveyFixture,
  SURVEY_CONTENT_ID,
  SURVEY_ROUND_ID,
  testUuid,
} from "./survey-test-fixtures";

describe("survey api", () => {
  it("현재 설문을 조회하고 Section 계약을 검증한다", async () => {
    const request = vi.fn().mockResolvedValue(currentSurveyFixture);
    const api = createSurveyApi(request);

    await expect(api.getCurrent()).resolves.toEqual(currentSurveyFixture);
    expect(request).toHaveBeenCalledWith("/me/surveys/current", {});
  });

  it("제출 payload와 멱등성 header를 그대로 전달한다", async () => {
    const responseId = testUuid(701);
    const request = vi.fn().mockResolvedValue({
      code: "SURVEY_RESPONSE_SUBMITTED",
      replayed: false,
      responseId,
      roundId: SURVEY_ROUND_ID,
      contentVersionId: SURVEY_CONTENT_ID,
      submittedAt: "2026-09-01T01:23:45Z",
    });
    const api = createSurveyApi(request);
    const command: SubmitSurveyRequest = {
      roundId: SURVEY_ROUND_ID,
      answers: [
        {
          questionId: testUuid(702),
          type: "SHORT_TEXT",
          text: "답변",
        },
      ],
    };
    const idempotencyKey = testUuid(703);

    await expect(api.submit(command, idempotencyKey)).resolves.toMatchObject({ responseId });
    expect(request).toHaveBeenCalledWith("/me/survey-responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(command),
    });
  });

  it("본인 응답과 eligibility endpoint를 제공한다", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(currentSurveyFixture.eligibility);
    const api = createSurveyApi(request);

    await expect(api.listResponses()).resolves.toEqual([]);
    await expect(api.getEligibility()).resolves.toEqual(currentSurveyFixture.eligibility);
    expect(request).toHaveBeenNthCalledWith(1, "/me/survey-responses", {});
    expect(request).toHaveBeenNthCalledWith(2, "/me/service-eligibility", {});
  });
});
