import { describe, expect, it, vi } from "vitest";
import {
  createFeatureFailureAnalyticsSession,
  getFeatureFailureDetails,
} from "./feature-failure-analytics";

describe("createFeatureFailureAnalyticsSession", () => {
  it("같은 오류 상태의 반복 렌더링은 한 번만 기록한다", () => {
    const sendEvent = vi.fn().mockReturnValue(true);
    const session = createFeatureFailureAnalyticsSession({
      domain: "chat",
      sendEvent,
      visitId: "visit-1",
    });
    const failure = {
      errorCode: "network",
      errorSource: "api" as const,
      incidentKey: "screen-load",
      operation: "screen_load",
      retryable: true,
      surface: "room_list",
    };

    expect(session.trackFailure(failure)).toBe(true);
    expect(session.trackFailure(failure)).toBe(false);
    expect(sendEvent).toHaveBeenCalledOnce();
    expect(sendEvent).toHaveBeenCalledWith("feature_failure", {
      attempt_number: 1,
      domain: "chat",
      error_code: "network",
      error_source: "api",
      incident_sequence: 1,
      operation: "screen_load",
      retryable: true,
      surface: "room_list",
      visit_id: "visit-1",
    });
  });

  it("사용자 재시도가 다시 실패한 경우에만 다음 시도를 기록한다", () => {
    const sendEvent = vi.fn().mockReturnValue(true);
    const session = createFeatureFailureAnalyticsSession({
      domain: "survey",
      sendEvent,
      visitId: "visit-1",
    });
    const failure = {
      errorCode: "server_error",
      errorSource: "api" as const,
      incidentKey: "submission",
      operation: "submission",
      retryable: true,
      surface: "participation",
    };

    session.trackFailure(failure);
    expect(session.trackRecoveryAttempt("submission", "user_retry")).toBe(true);
    expect(session.trackFailure(failure)).toBe(true);

    expect(sendEvent).toHaveBeenNthCalledWith(
      2,
      "feature_failure",
      expect.objectContaining({ attempt_number: 2, incident_sequence: 1 }),
    );
  });

  it("실패가 있었던 기능의 복구만 한 번 기록한다", () => {
    let now = 1_000;
    const sendEvent = vi.fn().mockReturnValue(true);
    const session = createFeatureFailureAnalyticsSession({
      domain: "vote",
      now: () => now,
      sendEvent,
      visitId: "visit-1",
    });

    expect(session.trackRecovered("ai-preparation")).toBe(false);
    session.trackFailure({
      errorCode: "PREDICTION_FAILED",
      errorSource: "api",
      incidentKey: "ai-preparation",
      operation: "ai_preparation",
      retryCount: 2,
      retryable: true,
      step: 1,
      surface: "participation",
    });
    session.trackRecoveryAttempt("ai-preparation", "user_retry");
    now = 1_450;

    expect(session.trackRecovered("ai-preparation")).toBe(true);
    expect(session.trackRecovered("ai-preparation")).toBe(false);
    expect(sendEvent).toHaveBeenLastCalledWith("feature_recovered", {
      attempt_number: 1,
      domain: "vote",
      error_code: "PREDICTION_FAILED",
      error_source: "api",
      incident_sequence: 1,
      operation: "ai_preparation",
      recovery_duration_ms: 450,
      recovery_trigger: "user_retry",
      retry_count: 2,
      step: 1,
      surface: "participation",
      visit_id: "visit-1",
    });
  });

  it("복구 이후의 재발은 새로운 오류 건으로 기록한다", () => {
    const sendEvent = vi.fn().mockReturnValue(true);
    const session = createFeatureFailureAnalyticsSession({
      domain: "chat",
      sendEvent,
      visitId: "visit-1",
    });
    const failure = {
      errorCode: "REALTIME_CONNECT_FAILED",
      errorSource: "websocket" as const,
      incidentKey: "realtime",
      operation: "realtime_connect",
      retryable: true,
      surface: "room",
    };

    session.trackFailure(failure);
    session.trackRecovered("realtime");
    session.trackFailure(failure);

    expect(sendEvent).toHaveBeenLastCalledWith(
      "feature_failure",
      expect.objectContaining({ attempt_number: 1, incident_sequence: 2 }),
    );
  });
});

describe("getFeatureFailureDetails", () => {
  it("원본 메시지 없이 허용된 코드와 HTTP 상태만 정규화한다", () => {
    expect(
      getFeatureFailureDetails(
        { code: "SURVEY_UNAVAILABLE", message: "민감한 원본", retryable: true, status: 503 },
        "api",
        "survey_load_failed",
      ),
    ).toEqual({
      errorCode: "SURVEY_UNAVAILABLE",
      errorSource: "api",
      httpStatus: 503,
      retryable: true,
    });
  });

  it("코드가 없는 네트워크 오류를 fallback으로 분류한다", () => {
    expect(getFeatureFailureDetails(new TypeError("Failed to fetch"), "api", "network")).toEqual({
      errorCode: "network",
      errorSource: "api",
      retryable: true,
    });
  });
});
