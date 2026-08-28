import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AdminRagSynonyms,
  parseSynonymInput,
  synonymGroupPath,
} from "@/components/rag/admin-rag-synonyms";

describe("RAG 동의어 관리", () => {
  it("관리자가 기준어와 동의어를 이해하기 쉬운 화면에서 관리한다", () => {
    const html = renderToStaticMarkup(createElement(AdminRagSynonyms));

    expect(html).toContain("동의어 관리");
    expect(html).toContain("기준어");
    expect(html).toContain("쉼표로 구분한 동의어");
    expect(html).not.toContain("synonym_group_id");
  });

  it("쉼표 입력은 공백과 중복을 제거한다", () => {
    expect(parseSynonymInput(" 시민 참여,시민참여, 시민 참여,  ")).toEqual([
      "시민 참여",
      "시민참여",
    ]);
  });

  it("수정·삭제 경로의 식별자를 안전하게 인코딩한다", () => {
    expect(synonymGroupPath("group/정책")).toBe("/api/v1/rag/synonyms/group%2F%EC%A0%95%EC%B1%85");
  });
});
