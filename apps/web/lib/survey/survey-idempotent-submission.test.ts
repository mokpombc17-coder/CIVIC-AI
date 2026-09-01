import { describe, expect, it, vi } from "vitest";
import { getOrCreatePendingSurveySubmission } from "./survey-idempotent-submission";
import { SURVEY_ROUND_ID, testUuid } from "./survey-test-fixtures";

describe("survey idempotent submission", () => {
  it("같은 payload 재시도에는 같은 key와 snapshot을 유지한다", () => {
    const createKey = vi.fn(() => testUuid(900));
    const payload = { roundId: SURVEY_ROUND_ID, answers: [] };
    const first = getOrCreatePendingSurveySubmission(null, payload, createKey);
    const retried = getOrCreatePendingSurveySubmission(first, payload, createKey);

    expect(retried).toBe(first);
    expect(createKey).toHaveBeenCalledOnce();
  });

  it("답변이 바뀐 payload에는 새로운 key를 생성한다", () => {
    const createKey = vi.fn().mockReturnValueOnce(testUuid(901)).mockReturnValueOnce(testUuid(902));
    const first = getOrCreatePendingSurveySubmission(
      null,
      { roundId: SURVEY_ROUND_ID, answers: [] },
      createKey,
    );
    const changed = getOrCreatePendingSurveySubmission(
      first,
      {
        roundId: SURVEY_ROUND_ID,
        answers: [
          {
            questionId: testUuid(903),
            type: "SHORT_TEXT",
            text: "변경된 답변",
          },
        ],
      },
      createKey,
    );

    expect(changed.idempotencyKey).not.toBe(first.idempotencyKey);
    expect(createKey).toHaveBeenCalledTimes(2);
  });
});
