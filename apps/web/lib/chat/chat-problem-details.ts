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
  replayed: boolean;
  retryable: boolean;
  fieldErrors?: readonly ChatFieldError[];
}>;

export function isChatProblemDetails(value: unknown): value is ChatProblemDetails {
  if (!isRecord(value)) {
    return false;
  }

  const fieldErrors = value.fieldErrors;

  return (
    typeof value.type === "string" &&
    typeof value.title === "string" &&
    typeof value.status === "number" &&
    Number.isInteger(value.status) &&
    typeof value.detail === "string" &&
    typeof value.instance === "string" &&
    typeof value.code === "string" &&
    typeof value.replayed === "boolean" &&
    typeof value.retryable === "boolean" &&
    (fieldErrors === undefined ||
      (Array.isArray(fieldErrors) && fieldErrors.every(isChatFieldError)))
  );
}

function isChatFieldError(value: unknown): value is ChatFieldError {
  return isRecord(value) && typeof value.field === "string" && typeof value.message === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
