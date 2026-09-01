import type { SubmitSurveyRequest } from "./survey-contracts";

export type PendingSurveySubmission = Readonly<{
  idempotencyKey: string;
  payload: SubmitSurveyRequest;
  fingerprint: string;
}>;

export function prepareSurveySubmission(
  payload: SubmitSurveyRequest,
  previous: PendingSurveySubmission | null,
  createKey: () => string = () => crypto.randomUUID(),
): PendingSurveySubmission {
  const fingerprint = JSON.stringify(payload);
  if (previous?.fingerprint === fingerprint) return previous;
  return { idempotencyKey: createKey(), payload, fingerprint };
}
