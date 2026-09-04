import type {
  AcceptSensitiveSurveyConsentRequest,
  AcceptSensitiveSurveyConsentResponse,
} from "./consent-contracts";

type ConsentDocumentReference = Readonly<
  Pick<AcceptSensitiveSurveyConsentRequest, "documentCode" | "documentVersion">
>;

export type PendingConsentAcceptance = Readonly<{
  idempotencyKey: string;
  payload: AcceptSensitiveSurveyConsentRequest;
  fingerprint: string;
  receipt: AcceptSensitiveSurveyConsentResponse | null;
}>;

export function prepareConsentAcceptance(
  document: ConsentDocumentReference,
  roundId: string,
  clientClickedAt: string,
  previous: PendingConsentAcceptance | null,
  createKey: () => string = () => crypto.randomUUID(),
): PendingConsentAcceptance {
  const fingerprint = JSON.stringify({
    clientClickedAt,
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
      clientClickedAt,
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
