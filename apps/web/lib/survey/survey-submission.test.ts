import { describe, expect, it, vi } from "vitest";
import type { SubmitSurveyRequest } from "./survey-contracts";
import { prepareSurveySubmission } from "./survey-submission";

const payload: SubmitSurveyRequest = {
  roundId: "11111111-1111-4111-8111-111111111111",
  consentReceiptId: "33333333-3333-4333-8333-333333333333",
  answers: [],
};

describe("prepareSurveySubmission", () => {
  it("같은 payload 재시도에는 같은 멱등성 키와 snapshot을 유지한다", () => {
    const createKey = vi.fn(() => "22222222-2222-4222-8222-222222222222");
    const first = prepareSurveySubmission(payload, null, createKey);
    const retried = prepareSurveySubmission(payload, first, createKey);
    expect(retried).toBe(first);
    expect(createKey).toHaveBeenCalledTimes(1);
  });
});
