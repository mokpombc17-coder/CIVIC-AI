import type {
  AcceptSensitiveSurveyConsentRequest,
  AcceptSensitiveSurveyConsentResponse,
  SensitiveSurveyConsentDocument,
} from "./consent-contracts";

export type PendingConsentAcceptance = Readonly<{
  idempotencyKey: string;
  payload: AcceptSensitiveSurveyConsentRequest;
  fingerprint: string;
  receipt: AcceptSensitiveSurveyConsentResponse | null;
}>;

export function prepareConsentAcceptance(
  document: SensitiveSurveyConsentDocument,
  roundId: string,
  previous: PendingConsentAcceptance | null,
  createKey: () => string = () => crypto.randomUUID(),
  createClickedAt: () => string = () => new Date().toISOString(),
): PendingConsentAcceptance {
  const fingerprint = JSON.stringify({
    documentCode: document.documentCode,
    documentVersion: document.documentVersion,
    roundId,
  });
  if (previous?.fingerprint === fingerprint) return previous;

  return {
    idempotencyKey: createKey(),
    payload: {
      documentCode: document.documentCode,
      documentVersion: document.documentVersion,
      roundId,
      clientClickedAt: createClickedAt(),
    },
    fingerprint,
    receipt: null,
  };
}

export function attachConsentReceipt(
  pending: PendingConsentAcceptance,
  receipt: AcceptSensitiveSurveyConsentResponse,
): PendingConsentAcceptance {
  return { ...pending, receipt };
}
