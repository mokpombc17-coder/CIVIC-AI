import type { SubmitSurveyRequest } from "./survey-contracts";

export type PendingSurveySubmission = Readonly<{
  idempotencyKey: string;
  payload: SubmitSurveyRequest;
  payloadSnapshot: string;
}>;

export function getOrCreatePendingSurveySubmission(
  current: PendingSurveySubmission | null,
  payload: SubmitSurveyRequest,
  createKey: () => string = () => crypto.randomUUID(),
): PendingSurveySubmission {
  const payloadSnapshot = JSON.stringify(payload);
  if (current?.payloadSnapshot === payloadSnapshot) return current;

  return {
    idempotencyKey: createKey(),
    payload,
    payloadSnapshot,
  };
}
