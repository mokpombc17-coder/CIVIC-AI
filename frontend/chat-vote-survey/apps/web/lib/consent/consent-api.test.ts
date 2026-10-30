import { describe, expect, it, vi } from "vitest";
import { createConsentApi } from "./consent-api";

const ROUND_ID = "11111111-1111-4111-8111-111111111111";
const RECEIPT_ID = "22222222-2222-4222-8222-222222222222";
const IDEMPOTENCY_KEY = "33333333-3333-4333-8333-333333333333";

describe("consent api", () => {
  it("동의 payload와 별도 Idempotency-Key를 전달한다", async () => {
    const request = vi.fn().mockResolvedValue({
      consentReceiptId: RECEIPT_ID,
      acceptedAt: "2026-09-03T03:00:01Z",
    });
    const command = {
      documentCode: "SENSITIVE_INFORMATION_CONSENT",
      documentVersion: "2026-09-03",
      roundId: ROUND_ID,
      clientClickedAt: "2026-09-03T03:00:00Z",
    };

    await createConsentApi(request).acceptSensitiveSurveyConsent(command, IDEMPOTENCY_KEY);

    expect(request).toHaveBeenCalledWith(
      "/api/v1/me/consent-acceptances",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": IDEMPOTENCY_KEY,
        },
        body: JSON.stringify(command),
      }),
    );
  });
});
