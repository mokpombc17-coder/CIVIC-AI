import { describe, expect, it, vi } from "vitest";
import {
  isServiceEligibilityGuardExemptPath,
  loadServiceEligibility,
  parseServiceEligibility,
  requiresCurrentSurvey,
  surveyLocation,
} from "./service-eligibility";

const requiredEligibility = {
  activeRoundId: "round-1",
  capabilities: ["SUBMIT_CURRENT_SURVEY"],
  eligible: false,
  evaluatedAt: "2026-09-02T00:00:00Z",
  nextAction: "COMPLETE_CURRENT_SURVEY",
  reason: "CURRENT_SURVEY_RESPONSE_REQUIRED",
  surveyRequirement: "REQUIRED",
} as const;

describe("Vote service eligibility", () => {
  it("uses eligible and nextAction as the survey redirect source of truth", () => {
    expect(requiresCurrentSurvey(requiredEligibility)).toBe(true);
    expect(requiresCurrentSurvey({ ...requiredEligibility, eligible: true })).toBe(false);
    expect(requiresCurrentSurvey({ ...requiredEligibility, nextAction: "NONE" })).toBe(false);
  });

  it("loads the dedicated eligibility endpoint without browser caching", async () => {
    const request = vi.fn<typeof fetch>(async () => Response.json(requiredEligibility));

    await expect(loadServiceEligibility(request)).resolves.toEqual(requiredEligibility);
    expect(request).toHaveBeenCalledWith("/api/v1/me/service-eligibility", {
      cache: "no-store",
      method: "GET",
    });
  });

  it("rejects a response without the required eligible boolean", () => {
    expect(() => parseServiceEligibility({ nextAction: "COMPLETE_CURRENT_SURVEY" })).toThrow(
      "Vote service eligibility response is invalid",
    );
  });

  it("exempts the 3001 survey route and authentication routes from the guard", () => {
    for (const path of [
      "/survey",
      "/survey/complete",
      "/login",
      "/signup",
      "/signup/profile",
      "/auth/refresh",
    ]) {
      expect(isServiceEligibilityGuardExemptPath(path)).toBe(true);
    }
    expect(isServiceEligibilityGuardExemptPath("/home")).toBe(false);
    expect(isServiceEligibilityGuardExemptPath("/rag")).toBe(false);
  });

  it("hands the original same-origin destination to the survey application", () => {
    expect(surveyLocation("/rag?folderId=welfare#answer")).toBe(
      "/survey?returnTo=%2Frag%3FfolderId%3Dwelfare%23answer",
    );
  });
});
