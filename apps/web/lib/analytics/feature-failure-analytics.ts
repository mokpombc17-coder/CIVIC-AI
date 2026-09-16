import type { GoogleAnalyticsEventParameters } from "./google-analytics";

export type FeatureFailureDomain = "chat" | "survey" | "vote";
export type FeatureFailureSource = "api" | "client" | "websocket";
export type FeatureRecoveryTrigger = "automatic" | "user_retry";

export type FeatureFailureDetails = Readonly<{
  errorCode: string;
  errorSource: FeatureFailureSource;
  httpStatus?: number;
  retryable: boolean;
}>;

export type FeatureFailureInput = FeatureFailureDetails &
  Readonly<{
    failureStage?: string;
    incidentKey: string;
    operation: string;
    retryCount?: number;
    step?: number;
    surface: string;
    wsCloseCode?: number;
  }>;

type FeatureFailureAnalyticsSessionOptions = Readonly<{
  domain: FeatureFailureDomain;
  now?: () => number;
  sendEvent: (eventName: string, parameters: GoogleAnalyticsEventParameters) => boolean;
  visitId: string;
}>;

type ActiveFailure = {
  attemptNumber: number;
  failureParameters: GoogleAnalyticsEventParameters;
  firstFailedAt: number;
  incidentSequence: number;
  recoveryAttempted: boolean;
  recoveryTrigger: FeatureRecoveryTrigger;
};

export type FeatureFailureAnalyticsSession = Readonly<{
  trackFailure: (input: FeatureFailureInput) => boolean;
  trackRecovered: (incidentKey: string) => boolean;
  trackRecoveryAttempt: (incidentKey: string, trigger: FeatureRecoveryTrigger) => boolean;
}>;

export function createFeatureFailureAnalyticsSession({
  domain,
  now = Date.now,
  sendEvent,
  visitId,
}: FeatureFailureAnalyticsSessionOptions): FeatureFailureAnalyticsSession {
  const activeFailures = new Map<string, ActiveFailure>();
  const incidentSequences = new Map<string, number>();

  return {
    trackFailure(input) {
      const current = activeFailures.get(input.incidentKey);
      if (current && !current.recoveryAttempted) return false;

      const incidentSequence =
        current?.incidentSequence ?? (incidentSequences.get(input.incidentKey) ?? 0) + 1;
      const attemptNumber = (current?.attemptNumber ?? 0) + 1;
      const failureParameters = createFailureParameters(input);
      const sent = sendEvent("feature_failure", {
        domain,
        ...failureParameters,
        attempt_number: attemptNumber,
        incident_sequence: incidentSequence,
        visit_id: visitId,
      });
      if (!sent) return false;

      incidentSequences.set(input.incidentKey, incidentSequence);
      activeFailures.set(input.incidentKey, {
        attemptNumber,
        failureParameters,
        firstFailedAt: current?.firstFailedAt ?? now(),
        incidentSequence,
        recoveryAttempted: false,
        recoveryTrigger: current?.recoveryTrigger ?? "automatic",
      });
      return true;
    },

    trackRecovered(incidentKey) {
      const current = activeFailures.get(incidentKey);
      if (!current) return false;

      const sent = sendEvent("feature_recovered", {
        domain,
        ...pickRecoveryParameters(current.failureParameters),
        attempt_number: current.attemptNumber,
        incident_sequence: current.incidentSequence,
        recovery_duration_ms: Math.max(0, now() - current.firstFailedAt),
        recovery_trigger: current.recoveryTrigger,
        visit_id: visitId,
      });
      if (sent) activeFailures.delete(incidentKey);
      return sent;
    },

    trackRecoveryAttempt(incidentKey, trigger) {
      const current = activeFailures.get(incidentKey);
      if (!current || current.recoveryAttempted) return false;
      current.recoveryAttempted = true;
      current.recoveryTrigger = trigger;
      return true;
    },
  };
}

export function getFeatureFailureDetails(
  error: unknown,
  errorSource: FeatureFailureSource,
  fallbackCode: string,
): FeatureFailureDetails {
  const record = isRecord(error) ? error : null;
  const httpStatus = readHttpStatus(record?.status);
  const errorCode = readErrorCode(record?.code) ?? getHttpErrorCode(httpStatus) ?? fallbackCode;
  const retryable =
    typeof record?.retryable === "boolean"
      ? record.retryable
      : error instanceof TypeError || (httpStatus !== undefined && httpStatus >= 500);

  return {
    errorCode,
    errorSource,
    ...(httpStatus === undefined ? {} : { httpStatus }),
    retryable,
  };
}

function createFailureParameters(input: FeatureFailureInput): GoogleAnalyticsEventParameters {
  return {
    error_code: input.errorCode,
    error_source: input.errorSource,
    operation: input.operation,
    retryable: input.retryable,
    surface: input.surface,
    ...(input.failureStage ? { failure_stage: input.failureStage } : {}),
    ...(input.httpStatus === undefined ? {} : { http_status: input.httpStatus }),
    ...(input.retryCount === undefined ? {} : { retry_count: Math.max(0, input.retryCount) }),
    ...(input.step === undefined ? {} : { step: input.step }),
    ...(input.wsCloseCode === undefined ? {} : { ws_close_code: input.wsCloseCode }),
  };
}

function pickRecoveryParameters(
  parameters: GoogleAnalyticsEventParameters,
): GoogleAnalyticsEventParameters {
  const recovered: Record<string, string | number | boolean> = {};
  for (const key of [
    "error_code",
    "error_source",
    "failure_stage",
    "http_status",
    "operation",
    "retry_count",
    "step",
    "surface",
    "ws_close_code",
  ]) {
    const value = parameters[key];
    if (value !== undefined) recovered[key] = value;
  }
  return recovered;
}

function readErrorCode(value: unknown): string | null {
  return typeof value === "string" && /^[a-z0-9_]{1,64}$/i.test(value) ? value : null;
}

function readHttpStatus(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599
    ? value
    : undefined;
}

function getHttpErrorCode(status: number | undefined): string | null {
  if (status === undefined) return null;
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status >= 500) return "server_error";
  return status >= 400 ? "request_failed" : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
