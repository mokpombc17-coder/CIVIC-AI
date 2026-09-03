import { describe, expect, it, vi } from "vitest";
import {
  createServiceEligibilityApi,
  requiresCurrentSurvey,
  serviceEligibilityQueryKey,
  type ServiceEligibility,
} from "./service-eligibility";

const ACTIVE_ROUND_ID = "11111111-1111-4111-8111-111111111111";

const requiredEligibility = {
  activeRoundId: ACTIVE_ROUND_ID,
  capabilities: ["SUBMIT_CURRENT_SURVEY", "VIEW_CURRENT_SURVEY"],
  eligible: false,
  evaluatedAt: "2026-09-03T00:00:00Z",
  nextAction: "COMPLETE_CURRENT_SURVEY",
  reason: "CURRENT_SURVEY_RESPONSE_REQUIRED",
  surveyRequirement: "REQUIRED",
} satisfies ServiceEligibility;

describe("service eligibility", () => {
  it("현재 사용자의 service eligibility endpoint를 조회하고 응답을 검증한다", async () => {
    const request = vi.fn().mockResolvedValue(requiredEligibility);

    await expect(createServiceEligibilityApi(request).getCurrent()).resolves.toEqual(
      requiredEligibility,
    );
    expect(request).toHaveBeenCalledWith("/me/service-eligibility", {});
  });

  it("조회 취소 signal을 전달한다", async () => {
    const request = vi.fn().mockResolvedValue(requiredEligibility);
    const controller = new AbortController();

    await createServiceEligibilityApi(request).getCurrent(controller.signal);

    expect(request).toHaveBeenCalledWith("/me/service-eligibility", {
      signal: controller.signal,
    });
  });

  it("계약에 맞지 않는 응답을 거부한다", async () => {
    const request = vi.fn().mockResolvedValue({
      ...requiredEligibility,
      eligible: "false",
    });

    await expect(createServiceEligibilityApi(request).getCurrent()).rejects.toThrow();
  });

  it("미완료이며 현재 설문 완료가 다음 행동일 때만 설문을 요구한다", () => {
    expect(requiresCurrentSurvey(requiredEligibility)).toBe(true);
    expect(requiresCurrentSurvey({ ...requiredEligibility, eligible: true })).toBe(false);
    expect(requiresCurrentSurvey({ ...requiredEligibility, nextAction: null })).toBe(false);
    expect(
      requiresCurrentSurvey({
        ...requiredEligibility,
        nextAction: "A_FUTURE_ACTION",
      }),
    ).toBe(false);
  });

  it("인증 성공 시 함께 제거할 수 있도록 vote query namespace를 사용한다", () => {
    expect(serviceEligibilityQueryKey).toEqual(["vote", "service-eligibility"]);
  });
});
