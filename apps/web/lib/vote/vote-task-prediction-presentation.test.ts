import { describe, expect, it } from "vitest";
import { formatPredictionRuntimeStatus } from "./vote-task-prediction-presentation";

describe("Vote Task prediction presentation", () => {
  it("원격 예측 상태의 안내와 최대 대기시간을 표시한다", () => {
    expect(
      formatPredictionRuntimeStatus({
        code: "PREDICTION_NOT_READY",
        detail: "AI 예상 이유를 준비 중입니다.",
        retryable: true,
        maxWaitMinutes: 10,
      }),
    ).toBe("AI 예상 이유를 준비 중입니다. 최대 예상 대기시간은 10분입니다.");
  });

  it("대기시간이 없는 실패 상태는 detail만 표시한다", () => {
    expect(
      formatPredictionRuntimeStatus({
        code: "PREDICTION_UNAVAILABLE",
        detail: "현재 개인별 AI 예상 이유를 제공할 수 없습니다.",
        retryable: false,
        maxWaitMinutes: 0,
      }),
    ).toBe("현재 개인별 AI 예상 이유를 제공할 수 없습니다.");
    expect(formatPredictionRuntimeStatus(null)).toBeNull();
  });
});
