export type ChatFieldError = Readonly<{
  field: string;
  message: string;
}>;

export type ChatProblemDetails = Readonly<{
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  clientRequestId?: string;
  replayed: boolean;
  retryable: boolean;
  retryAfterMs?: number;
  fieldErrors?: readonly ChatFieldError[];
}>;

export function isChatProblemDetails(value: unknown): value is ChatProblemDetails {
  if (!isRecord(value)) {
    return false;
  }

  const fieldErrors = value.fieldErrors;
  const retryAfterMs = value.retryAfterMs;
  const isValidRetryAfterMs =
    retryAfterMs === undefined ||
    (typeof retryAfterMs === "number" && Number.isSafeInteger(retryAfterMs) && retryAfterMs >= 1);
  const isMessageSearchRateLimit = value.code === "MESSAGE_SEARCH_RATE_LIMITED";

  const isCommonProblemDetails =
    typeof value.type === "string" &&
    typeof value.title === "string" &&
    typeof value.status === "number" &&
    Number.isInteger(value.status) &&
    typeof value.detail === "string" &&
    typeof value.instance === "string" &&
    typeof value.code === "string" &&
    (value.clientRequestId === undefined || typeof value.clientRequestId === "string") &&
    typeof value.replayed === "boolean" &&
    typeof value.retryable === "boolean" &&
    isValidRetryAfterMs &&
    (fieldErrors === undefined ||
      (Array.isArray(fieldErrors) && fieldErrors.every(isChatFieldError)));

  if (!isCommonProblemDetails) {
    return false;
  }

  return (
    !isMessageSearchRateLimit ||
    (value.status === 429 &&
      value.replayed === false &&
      value.retryable === true &&
      retryAfterMs !== undefined)
  );
}

function isChatFieldError(value: unknown): value is ChatFieldError {
  return isRecord(value) && typeof value.field === "string" && typeof value.message === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
