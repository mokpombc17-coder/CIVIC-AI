import { describe, expect, it } from "vitest";
import {
  createEligibilityLoginLocation,
  createRequiredSurveyLocation,
  getCurrentDocumentPath,
} from "./service-eligibility-navigation";

describe("service eligibility navigation", () => {
  it("현재 문서의 pathname, search, hash를 보존한다", () => {
    expect(
      getCurrentDocumentPath({
        pathname: "/chat/01011",
        search: "?tab=members",
        hash: "#message-10",
      }),
    ).toBe("/chat/01011?tab=members#message-10");
  });

  it("현재 문서 경로를 설문 returnTo로 인코딩한다", () => {
    expect(createRequiredSurveyLocation("/chat/01011?tab=members#message-10")).toBe(
      "/survey?returnTo=%2Fchat%2F01011%3Ftab%3Dmembers%23message-10",
    );
  });

  it("인증이 없으면 현재 문서로 돌아오는 로그인 주소를 만든다", () => {
    expect(createEligibilityLoginLocation("/vote/task-1?source=push")).toBe(
      "/login?returnTo=%2Fvote%2Ftask-1%3Fsource%3Dpush",
    );
  });
});
