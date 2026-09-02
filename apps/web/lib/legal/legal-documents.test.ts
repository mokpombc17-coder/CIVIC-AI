import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { LEGAL_DOCUMENT_HISTORY, LEGAL_DOCUMENTS } from "./legal-documents";

describe("immutable signup legal documents", () => {
  it.each(LEGAL_DOCUMENT_HISTORY)("keeps $id version $version content-addressed", (document) => {
    expect(createHash("sha256").update(document.body, "utf8").digest("hex")).toBe(
      document.bodySha256,
    );
    if (document.id === "ACCOUNT_RAG_PRIVACY" && document.version === "1") {
      expect(document.body).toContain("동의 거부 권리와 영향");
      expect(document.body).toContain("가입을 완료할 수 없고");
    }
  });

  it("publishes the required general privacy consent separately from sensitive information", () => {
    const document = LEGAL_DOCUMENTS.ACCOUNT_RAG_PRIVACY;

    expect(document.version).toBe("3");
    expect(document.title).toBe("개인정보 수집·이용 동의");
    expect(document.body).toContain("수집·이용 목적");
    expect(document.body).toContain("보유·이용기간 및 파기");
    expect(document.body).toContain("동의 거부 및 철회");
    expect(document.body).toContain("별도 민감정보 동의");
  });
});
