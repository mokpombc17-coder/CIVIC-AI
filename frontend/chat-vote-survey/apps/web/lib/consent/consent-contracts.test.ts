import { describe, expect, it } from "vitest";
import {
  acceptSensitiveSurveyConsentRequestSchema,
  acceptSensitiveSurveyConsentResponseSchema,
} from "./consent-contracts";

const ROUND_ID = "11111111-1111-4111-8111-111111111111";
const RECEIPT_ID = "22222222-2222-4222-8222-222222222222";

describe("sensitive survey consent contracts", () => {
  it("서버가 생성한 동의 시각을 검증한다", () => {
    expect(
      acceptSensitiveSurveyConsentResponseSchema.parse({
        consentReceiptId: RECEIPT_ID,
        acceptedAt: "2026-09-03T03:00:00Z",
      }),
    ).toMatchObject({ consentReceiptId: RECEIPT_ID });
  });

  it("프론트 클릭 시각은 선택적인 보조 정보로만 전송한다", () => {
    expect(
      acceptSensitiveSurveyConsentRequestSchema.parse({
        documentCode: "SENSITIVE_INFORMATION_CONSENT",
        documentVersion: "2026-09-03",
        roundId: ROUND_ID,
      }),
    ).not.toHaveProperty("clientClickedAt");
  });
});
