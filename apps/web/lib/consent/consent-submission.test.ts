import { describe, expect, it, vi } from "vitest";
import { attachConsentReceipt, prepareConsentAcceptance } from "./consent-submission";

const ROUND_ID = "11111111-1111-4111-8111-111111111111";
const RECEIPT_ID = "22222222-2222-4222-8222-222222222222";
const IDEMPOTENCY_KEY = "33333333-3333-4333-8333-333333333333";
const document = {
  documentCode: "SENSITIVE_INFORMATION_CONSENT",
  documentVersion: "2026-09-03",
};

describe("consent submission", () => {
  it("같은 동의 재시도에는 최초 클릭 시각과 멱등성 키를 유지한다", () => {
    const createKey = vi.fn(() => IDEMPOTENCY_KEY);
    const clickedAt = "2026-09-03T03:00:00Z";
    const first = prepareConsentAcceptance(document, ROUND_ID, clickedAt, null, createKey);
    const retried = prepareConsentAcceptance(document, ROUND_ID, clickedAt, first, createKey);

    expect(retried).toBe(first);
    expect(createKey).toHaveBeenCalledTimes(1);
    expect(retried.payload.clientClickedAt).toBe(clickedAt);
  });

  it("발급된 receipt를 재시도 상태에 보존한다", () => {
    const pending = prepareConsentAcceptance(
      document,
      ROUND_ID,
      "2026-09-03T03:00:00Z",
      null,
      () => IDEMPOTENCY_KEY,
    );
    const completed = attachConsentReceipt(pending, {
      consentReceiptId: RECEIPT_ID,
      acceptedAt: "2026-09-03T03:00:01Z",
    });

    expect(completed.receipt?.consentReceiptId).toBe(RECEIPT_ID);
    expect(completed.payload.clientClickedAt).toBe("2026-09-03T03:00:00Z");
  });
});
