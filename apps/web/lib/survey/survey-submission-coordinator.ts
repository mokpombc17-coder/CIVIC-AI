import type {
  AcceptSensitiveSurveyConsentRequest,
  AcceptSensitiveSurveyConsentResponse,
} from "@/lib/consent/consent-contracts";
import {
  attachConsentReceipt,
  prepareConsentAcceptance,
  type PendingConsentAcceptance,
} from "@/lib/consent/consent-submission";
import { buildSubmitSurveyRequest, type SurveyAnswerState } from "./survey-answer-state";
import type { SubmissionResponse, SubmitSurveyRequest, SurveySection } from "./survey-contracts";
import { prepareSurveySubmission, type PendingSurveySubmission } from "./survey-submission";

type ConsentDocumentReference = Readonly<{
  documentCode: string;
  documentVersion: string;
}>;

type SurveySubmissionPorts = Readonly<{
  acceptConsent: (
    command: AcceptSensitiveSurveyConsentRequest,
    idempotencyKey: string,
  ) => Promise<AcceptSensitiveSurveyConsentResponse>;
  submitSurvey: (
    command: SubmitSurveyRequest,
    idempotencyKey: string,
  ) => Promise<SubmissionResponse>;
}>;

export class SurveySubmissionCoordinator {
  private pendingConsentAcceptance: PendingConsentAcceptance | null = null;
  private pendingSubmission: PendingSurveySubmission | null = null;

  constructor(private readonly createIdempotencyKey: () => string = () => crypto.randomUUID()) {}

  async submit({
    answers,
    clientClickedAt,
    document,
    ports,
    roundId,
    sections,
  }: {
    answers: SurveyAnswerState;
    clientClickedAt: string;
    document: ConsentDocumentReference;
    ports: SurveySubmissionPorts;
    roundId: string;
    sections: readonly SurveySection[];
  }): Promise<SubmissionResponse> {
    let pendingConsent = prepareConsentAcceptance(
      document,
      roundId,
      clientClickedAt,
      this.pendingConsentAcceptance,
      this.createIdempotencyKey,
    );
    this.pendingConsentAcceptance = pendingConsent;
    let receipt = pendingConsent.receipt;

    if (!receipt) {
      receipt = await ports.acceptConsent(pendingConsent.payload, pendingConsent.idempotencyKey);
      pendingConsent = attachConsentReceipt(pendingConsent, receipt);
      this.pendingConsentAcceptance = pendingConsent;
    }

    const payload = buildSubmitSurveyRequest(roundId, receipt.consentReceiptId, sections, answers);
    const prepared = prepareSurveySubmission(
      payload,
      this.pendingSubmission,
      this.createIdempotencyKey,
    );
    this.pendingSubmission = prepared;
    return ports.submitSurvey(prepared.payload, prepared.idempotencyKey);
  }

  reset(): void {
    this.pendingConsentAcceptance = null;
    this.pendingSubmission = null;
  }
}
