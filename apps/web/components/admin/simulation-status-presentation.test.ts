import { describe, expect, it } from "vitest";
import {
  providerWaitLabel,
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
    expect(message).toBe("외부 모델 호출에 실패했습니다. 모델 상태를 확인한 뒤 다시 실행하세요.");
    expect(message).not.toContain("3회");
    expect(message).not.toContain("CALIBRATION_ATTEMPTS_EXHAUSTED");
  });

  it("gives an actionable capacity message without exposing the internal sample policy", () => {
    const message = simulationRecoveryMessage({
      state: "REVIEW_REQUIRED",
      errorCode: "CALIBRATION_C_NETWORK_CAPACITY_INSUFFICIENT",
    });

    expect(simulationStateLabel("REVIEW_REQUIRED")).toBe("표본 재설정 필요");
    expect(message).toBe(
      "선택 조건에 맞는 가상 패널이 부족합니다. 조건을 조정하거나 새 표본 시드로 다시 실행하세요.",
    );
    expect(message).not.toContain("C형");
    expect(message).not.toContain("CALIBRATION_C_NETWORK_CAPACITY_INSUFFICIENT");
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
