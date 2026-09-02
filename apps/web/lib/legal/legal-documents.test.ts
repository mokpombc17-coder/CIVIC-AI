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

  it("publishes account and RAG processing as required information instead of consent", () => {
    const document = LEGAL_DOCUMENTS.ACCOUNT_RAG_PRIVACY;

    expect(document.version).toBe("2");
    expect(document.title).toContain("필수정보 처리 안내");
    expect(document.body).toContain("별도의 개인정보 수집·이용 동의문이 아니라");
    expect(document.body).toContain("RAG 기능을 요청한 경우에만 처리");
    expect(document.body).not.toContain("거부하면 가입");
  });
});
