import { describe, expect, it } from "vitest";
import { currentSurveyResponseSchema, submissionResponseSchema } from "./survey-contracts";

const ROUND_ID = "11111111-1111-4111-8111-111111111111";
const CONTENT_ID = "22222222-2222-4222-8222-222222222222";

describe("survey v4 contracts", () => {
  it("PENDING 응답을 status discriminator로 해석한다", () => {
    expect(
      currentSurveyResponseSchema.parse({
        status: "PENDING",
        roundId: ROUND_ID,
        contentVersionId: CONTENT_ID,
        sections: [],
      }).status,
    ).toBe("PENDING");
  });

  it("preview 성공은 responseId 없이 해석한다", () => {
    expect(
      submissionResponseSchema.parse({
        status: "PREVIEW_VALIDATED",
        persisted: false,
        roundId: ROUND_ID,
        contentVersionId: CONTENT_ID,
        validatedAt: "2026-09-01T07:00:00Z",
      }),
    ).not.toHaveProperty("responseId");
  });
});
