import { describe, expect, it, vi } from "vitest";
import type {
  AcceptSensitiveSurveyConsentRequest,
  AcceptSensitiveSurveyConsentResponse,
} from "@/lib/consent/consent-contracts";
import { createSurveyAnswerState } from "./survey-answer-state";
import type { SubmissionResponse, SubmitSurveyRequest, SurveySection } from "./survey-contracts";
import { SurveySubmissionCoordinator } from "./survey-submission-coordinator";

const sections = [
  {
    sectionKey: "profile",
    title: "기본 정보",
    questions: [
      {
        type: "SHORT_TEXT",
        questionId: "question-1",
        questionKey: "nickname",
        title: "이름",
        prompt: "이름",
        required: true,
        maxLength: 100,
      },
    ],
  },
] satisfies readonly SurveySection[];

const submissionResponse = {
  status: "SUBMITTED",
  persisted: true,
  replayed: false,
  responseId: "response-1",
  roundId: "round-1",
  contentVersionId: "content-version-1",
  submittedAt: "2026-10-07T00:00:00Z",
} satisfies SubmissionResponse;

describe("SurveySubmissionCoordinator", () => {
  it("동의 receipt를 받은 뒤 설문을 제출한다", async () => {
    const coordinator = createCoordinator();
    const acceptConsent = vi.fn<AcceptConsent>().mockResolvedValue({
      consentReceiptId: "receipt-1",
      acceptedAt: "2026-10-07T00:00:01Z",
    });
    const submitSurvey = vi.fn<SubmitSurvey>().mockResolvedValue(submissionResponse);

    await expect(
      coordinator.submit(createSubmitInput({ acceptConsent, submitSurvey })),
    ).resolves.toBe(submissionResponse);

    expect(acceptConsent).toHaveBeenCalledOnce();
    expect(submitSurvey).toHaveBeenCalledOnce();
    expect(submitSurvey.mock.calls[0]?.[0]).toMatchObject({
      consentReceiptId: "receipt-1",
      roundId: "round-1",
    });
  });

  it("설문 재시도에서는 발급된 receipt와 같은 설문 idempotency key를 재사용한다", async () => {
    const coordinator = createCoordinator();
    const acceptConsent = vi.fn<AcceptConsent>().mockResolvedValue({
      consentReceiptId: "receipt-1",
      acceptedAt: "2026-10-07T00:00:01Z",
    });
    const submitSurvey = vi
      .fn<SubmitSurvey>()
      .mockRejectedValueOnce(new TypeError("network failed"))
      .mockResolvedValueOnce(submissionResponse);
    const input = createSubmitInput({ acceptConsent, submitSurvey });

    await expect(coordinator.submit(input)).rejects.toThrow("network failed");
    await expect(coordinator.submit(input)).resolves.toBe(submissionResponse);

    expect(acceptConsent).toHaveBeenCalledOnce();
    expect(submitSurvey).toHaveBeenCalledTimes(2);
    expect(submitSurvey.mock.calls[0]?.[1]).toBe(submitSurvey.mock.calls[1]?.[1]);
    expect(submitSurvey.mock.calls[0]?.[0]).toEqual(submitSurvey.mock.calls[1]?.[0]);
  });

  it("reset 이후에는 동의와 설문 요청을 새로 준비한다", async () => {
    const coordinator = createCoordinator();
    const acceptConsent = vi.fn<AcceptConsent>().mockResolvedValue({
      consentReceiptId: "receipt-1",
      acceptedAt: "2026-10-07T00:00:01Z",
    });
    const submitSurvey = vi.fn<SubmitSurvey>().mockResolvedValue(submissionResponse);
    const input = createSubmitInput({ acceptConsent, submitSurvey });

    await coordinator.submit(input);
    coordinator.reset();
    await coordinator.submit(input);

    expect(acceptConsent).toHaveBeenCalledTimes(2);
    expect(acceptConsent.mock.calls[0]?.[1]).not.toBe(acceptConsent.mock.calls[1]?.[1]);
    expect(submitSurvey.mock.calls[0]?.[1]).not.toBe(submitSurvey.mock.calls[1]?.[1]);
  });
});

function createCoordinator(): SurveySubmissionCoordinator {
  let sequence = 0;
  return new SurveySubmissionCoordinator(() => `idempotency-${++sequence}`);
}

function createSubmitInput({
  acceptConsent,
  submitSurvey,
}: {
  acceptConsent: AcceptConsent;
  submitSurvey: SubmitSurvey;
}) {
  const answers = {
    ...createSurveyAnswerState(sections),
    "question-1": { type: "SHORT_TEXT", text: "홍길동" } as const,
  };
  return {
    answers,
    clientClickedAt: "2026-10-07T00:00:00Z",
    document: {
      documentCode: "SENSITIVE_INFORMATION_CONSENT",
      documentVersion: "2026-09-04",
    },
    ports: { acceptConsent, submitSurvey },
    roundId: "round-1",
    sections,
  };
}

type AcceptConsent = (
  command: AcceptSensitiveSurveyConsentRequest,
  idempotencyKey: string,
) => Promise<AcceptSensitiveSurveyConsentResponse>;

type SubmitSurvey = (
  command: SubmitSurveyRequest,
  idempotencyKey: string,
) => Promise<SubmissionResponse>;
