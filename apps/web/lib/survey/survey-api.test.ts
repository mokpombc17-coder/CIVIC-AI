import { describe, expect, it, vi } from "vitest";
import { createSurveyApi } from "./survey-api";

const ROUND_ID = "11111111-1111-4111-8111-111111111111";
const CONTENT_ID = "22222222-2222-4222-8222-222222222222";
const KEY = "33333333-3333-4333-8333-333333333333";

describe("survey api", () => {
  it("현재 설문 endpoint를 조회하고 v4 응답을 검증한다", async () => {
    const request = vi.fn().mockResolvedValue({
      status: "PENDING",
      roundId: ROUND_ID,
      contentVersionId: CONTENT_ID,
      sections: [],
    });
    await expect(createSurveyApi(request).getCurrent()).resolves.toMatchObject({
      status: "PENDING",
    });
    expect(request).toHaveBeenCalledWith("/me/surveys/current", {});
  });

  it("제출 payload와 Idempotency-Key만 전달한다", async () => {
    const request = vi.fn().mockResolvedValue({
      status: "PREVIEW_VALIDATED",
      persisted: false,
      roundId: ROUND_ID,
      contentVersionId: CONTENT_ID,
      validatedAt: "2026-09-01T07:00:00Z",
    });
    await createSurveyApi(request).submit({ roundId: ROUND_ID, answers: [] }, KEY);
    expect(request).toHaveBeenCalledWith(
      "/me/survey-responses",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": KEY },
        body: JSON.stringify({ roundId: ROUND_ID, answers: [] }),
      }),
    );
  });

  it("본인 응답 이력 endpoint를 조회한다", async () => {
    const request = vi.fn().mockResolvedValue([]);
    await expect(createSurveyApi(request).getHistory()).resolves.toEqual([]);
    expect(request).toHaveBeenCalledWith("/me/survey-responses", {});
  });
});
