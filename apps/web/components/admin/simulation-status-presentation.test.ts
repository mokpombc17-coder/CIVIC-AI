import { describe, expect, it } from "vitest";
import {
  isRetryBlocked,
  providerWaitLabel,
  roundWholeRunEtaSeconds,
  simulationRecoveryMessage,
  simulationStateLabel,
} from "./admin-simulation-screen";

describe("simulation V2 terminal presentation", () => {
  it("explains provider failure without exposing internal attempt counts or raw codes", () => {
    const message = simulationRecoveryMessage({
      state: "FAILED_PROVIDER",
      errorCode: "CALIBRATION_ATTEMPTS_EXHAUSTED",
    });

    expect(simulationStateLabel("FAILED_PROVIDER")).toBe("외부 모델 호출 실패");
    expect(message).toBe(
      "AI 응답 검증에 반복 실패해 시뮬레이션을 중단했습니다. 잠시 후 다시 시도해 주세요.",
    );
    expect(message).not.toContain("3회");
    expect(message).not.toContain("CALIBRATION_ATTEMPTS_EXHAUSTED");
  });

  it("presents review as a failed-only retry without inventing a capacity failure", () => {
    const message = simulationRecoveryMessage({
      state: "REVIEW_REQUIRED",
      errorCode: "FINAL_RESPONSE_SLOTS_INCOMPLETE",
    });

    expect(simulationStateLabel("REVIEW_REQUIRED")).toBe("일부 패널 응답 실패");
    expect(message).toBe(
      "일부 가상 패널 응답을 완료하지 못했습니다. 실패 패널만 다시 실행할 수 있습니다.",
    );
  });

  it("renders publishing and policy refusal without internal provider details", () => {
    expect(simulationStateLabel("PUBLISHING")).toBe("결과 정리 중");
    expect(simulationStateLabel("REJECTED_PROVIDER_POLICY")).toBe("시뮬레이션 불가");
    expect(
      simulationRecoveryMessage({
        state: "REJECTED_PROVIDER_POLICY",
        errorCode: "PROVIDER_POLICY_REFUSAL",
      }),
    ).toBe("이 질문은 AI 공급자 정책상 시뮬레이션할 수 없습니다.");
  });

  it("rounds only positive whole-run ETA at the one-hour boundary", () => {
    expect(roundWholeRunEtaSeconds(0)).toBeNull();
    expect(roundWholeRunEtaSeconds(1)).toBe(60);
    expect(roundWholeRunEtaSeconds(3599)).toBe(3600);
    expect(roundWholeRunEtaSeconds(3600)).toBe(3600);
    expect(roundWholeRunEtaSeconds(3601)).toBe(3900);
  });

  it("blocks failed-only retry only before the server timestamp", () => {
    expect(isRetryBlocked(null, Date.parse("2026-08-27T00:00:00Z"))).toBe(false);
    expect(isRetryBlocked("2026-08-27T00:00:01Z", Date.parse("2026-08-27T00:00:00Z"))).toBe(true);
    expect(isRetryBlocked("2026-08-27T00:00:01Z", Date.parse("2026-08-27T00:00:01Z"))).toBe(false);
  });

  it("presents every internal provider retry stage as one generic wait state", () => {
    const internalReasons = [
      "answer_distribution_retry",
      "answer_fit_retry",
      "information_ratio_retry",
      "information_fit_retry",
      "unknown_internal_stage",
      null,
    ];

    for (const reason of internalReasons) {
      expect(providerWaitLabel(reason)).toBe("외부 모델 응답 지연으로 자동 재시도 중입니다.");
    }
  });
});
