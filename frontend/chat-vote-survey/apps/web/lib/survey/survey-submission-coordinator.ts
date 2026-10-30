import type {
  AcceptSensitiveSurveyConsentRequest,
  AcceptSensitiveSurveyConsentResponse,
} from "@/lib/consent/consent-contracts";
import {
  attachConsentReceipt,
  prepareConsentAcceptance,
  type PendingConsentAcceptance,
} from "@/lib/consent/consent-submission";
import {
  buildSubmitSurveyRequest,
  hasAnsweredOptionalQuestion,
  type SurveyAnswerState,
} from "./survey-answer-state";
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
    clientClickedAt: string | null;
    document: ConsentDocumentReference;
    ports: SurveySubmissionPorts;
    roundId: string;
    sections: readonly SurveySection[];
  }): Promise<SubmissionResponse> {
    const consentReceiptId = hasAnsweredOptionalQuestion(sections, answers)
      ? await this.acceptConsent(document, roundId, clientClickedAt, ports)
      : null;
    const payload = buildSubmitSurveyRequest(roundId, consentReceiptId, sections, answers);
    const prepared = prepareSurveySubmission(
      payload,
      this.pendingSubmission,
      this.createIdempotencyKey,
    );
    this.pendingSubmission = prepared;
    return ports.submitSurvey(prepared.payload, prepared.idempotencyKey);
  }

  private async acceptConsent(
    document: ConsentDocumentReference,
    roundId: string,
    clientClickedAt: string | null,
    ports: SurveySubmissionPorts,
  ): Promise<string> {
    if (clientClickedAt === null) {
      throw new Error("선택 문항에 응답한 제출에는 민감정보 동의 시각이 필요합니다.");
    }

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

    return receipt.consentReceiptId;
  }

  reset(): void {
    this.pendingConsentAcceptance = null;
    this.pendingSubmission = null;
  }
}
