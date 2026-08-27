import { describe, expect, it } from "vitest";
import { simulationRecoveryMessage, simulationStateLabel } from "./admin-simulation-screen";

describe("simulation V2 terminal presentation", () => {
  it("explains durable provider-attempt exhaustion without exposing the raw code", () => {
    const message = simulationRecoveryMessage({
      state: "FAILED_PROVIDER",
      errorCode: "CALIBRATION_ATTEMPTS_EXHAUSTED",
    });

    expect(simulationStateLabel("FAILED_PROVIDER")).toBe("외부 모델 호출 실패");
    expect(message).toContain("3회");
    expect(message).not.toContain("CALIBRATION_ATTEMPTS_EXHAUSTED");
  });

  it("gives the safe reseed action when the sealed C sample is insufficient", () => {
    const message = simulationRecoveryMessage({
      state: "REVIEW_REQUIRED",
      errorCode: "CALIBRATION_C_NETWORK_CAPACITY_INSUFFICIENT",
    });

    expect(simulationStateLabel("REVIEW_REQUIRED")).toBe("표본 재설정 필요");
    expect(message).toBe("C형 네트워크 가능 인원이 부족합니다. 다른 표본 시드로 다시 실행하세요.");
    expect(message).not.toContain("CALIBRATION_C_NETWORK_CAPACITY_INSUFFICIENT");
  });
});
