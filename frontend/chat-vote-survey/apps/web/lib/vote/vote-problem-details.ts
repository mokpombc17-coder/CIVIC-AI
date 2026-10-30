export type VoteApiViolation = Readonly<{
  code: string;
  path?: string;
  field?: string;
  message?: string;
  questionId?: string;
  itemId?: string;
  optionId?: string;
  details?: Readonly<Record<string, unknown>>;
}>;

export type VoteProblemDetails = Readonly<{
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  replayed?: boolean;
  retryable?: boolean;
  traceId?: string;
  violations?: readonly VoteApiViolation[];
}>;

export function isVoteProblemDetails(value: unknown): value is VoteProblemDetails {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.type === "string" &&
    typeof value.title === "string" &&
    Number.isInteger(value.status) &&
    typeof value.detail === "string" &&
    typeof value.instance === "string" &&
    typeof value.code === "string" &&
    (value.replayed === undefined || typeof value.replayed === "boolean") &&
    (value.retryable === undefined || typeof value.retryable === "boolean") &&
    (value.traceId === undefined || typeof value.traceId === "string") &&
    (value.violations === undefined ||
      (Array.isArray(value.violations) && value.violations.every(isVoteApiViolation)))
  );
}

function isVoteApiViolation(value: unknown): value is VoteApiViolation {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    (value.path === undefined || typeof value.path === "string") &&
    (value.field === undefined || typeof value.field === "string") &&
    (value.message === undefined || typeof value.message === "string") &&
    (value.questionId === undefined || typeof value.questionId === "string") &&
    (value.itemId === undefined || typeof value.itemId === "string") &&
    (value.optionId === undefined || typeof value.optionId === "string") &&
    (value.details === undefined || isRecord(value.details))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
