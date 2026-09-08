import { describe, expect, it } from "vitest";
import {
  formatPredictionRuntimeStatus,
  formatPredictionWaitingMessage,
  isPredictionNotReady,
} from "./vote-task-prediction-presentation";

describe("Vote Task prediction presentation", () => {
  it("원격 예측 상태의 안내와 최대 대기시간을 표시한다", () => {
    expect(
      formatPredictionRuntimeStatus({
        code: "PREDICTION_NOT_READY",
        detail: "AI 예상 이유를 준비 중입니다.",
        retryable: true,
        maxWaitMinutes: 10,
      }),
    ).toBe("AI 예상 이유를 준비 중입니다.\n최대 예상 대기시간은 10분입니다.");
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

  it("PROCESSING 대기 상태는 예상 대기시간 없이 AI 준비 안내를 표시한다", () => {
    expect(
      formatPredictionWaitingMessage({
        runtimeStatus: null,
        waiting: true,
      }),
    ).toBe("AI 예상 이유를 준비 중입니다.");
  });

  it("원격 대기 상태는 서버가 제공한 예상 대기시간을 함께 표시한다", () => {
    expect(
      formatPredictionWaitingMessage({
        runtimeStatus: {
          code: "PREDICTION_NOT_READY",
          detail: "AI 예상 이유를 준비 중입니다.",
          retryable: true,
          maxWaitMinutes: 10,
        },
        waiting: true,
      }),
    ).toBe("AI 예상 이유를 준비 중입니다.\n최대 예상 대기시간은 10분입니다.");
  });

  it("PREDICTION_NOT_READY 상태를 참여 action 숨김 조건으로 구분한다", () => {
    expect(
      isPredictionNotReady({
        runtimeStatus: {
          code: "PREDICTION_NOT_READY",
          detail: "AI 예상 이유를 준비 중입니다.",
          retryable: true,
          maxWaitMinutes: 10,
        },
      }),
    ).toBe(true);
    expect(isPredictionNotReady({ runtimeStatus: null })).toBe(false);
    expect(isPredictionNotReady(undefined)).toBe(false);
  });
});
