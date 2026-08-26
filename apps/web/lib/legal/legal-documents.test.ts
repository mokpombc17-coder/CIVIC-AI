import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { LEGAL_DOCUMENTS } from "./legal-documents";

describe("immutable signup legal documents", () => {
  it.each(Object.values(LEGAL_DOCUMENTS))(
    "keeps $id version $version content-addressed",
    (document) => {
      expect(createHash("sha256").update(document.body, "utf8").digest("hex")).toBe(
        document.bodySha256,
      );
      if (document.id === "ACCOUNT_RAG_PRIVACY") {
        expect(document.body).toContain("동의 거부 권리와 영향");
        expect(document.body).toContain("가입을 완료할 수 없고");
      }
    },
  );
});
