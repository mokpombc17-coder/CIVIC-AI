// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FeatureFailureAnalyticsSession } from "@/lib/analytics/feature-failure-analytics";
import type { SubmissionResponse } from "@/lib/survey/survey-contracts";
import type { ServiceEligibility } from "@/lib/vote/service-eligibility";
import { SurveySubmissionCompletion } from "./survey-submission-completion";

const eligibilityHarness = vi.hoisted(() => ({
  current: null as unknown,
}));

vi.mock("@/lib/vote/service-eligibility", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/vote/service-eligibility")>();

  return {
    ...actual,
    getServiceEligibilityQueryOptions: () =>
      actual.getServiceEligibilityQueryOptions({
        getCurrent: async () => eligibilityHarness.current as ServiceEligibility,
      }),
  };
});

const failureAnalytics: FeatureFailureAnalyticsSession = {
  trackFailure: vi.fn(() => true),
  trackRecovered: vi.fn(() => true),
  trackRecoveryAttempt: vi.fn(() => true),
};

describe("SurveySubmissionCompletion", () => {
  afterEach(() => {
    cleanup();
  });

  it("미리보기 검증을 마치면 설문 없이 들어갈 수 있는 홈으로 나가는 길을 둔다", () => {
    renderCompletion({
      status: "PREVIEW_VALIDATED",
      persisted: false,
      roundId: "11111111-1111-4111-8111-111111111111",
      contentVersionId: "22222222-2222-4222-8222-222222222222",
      validatedAt: "2026-10-27T00:00:00Z",
    });

    expect(screen.getByText("미리보기 응답은 저장되지 않습니다.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "홈으로" }).getAttribute("href")).toBe("/home");
  });

  it("완료 상태가 반영되지 않으면 다시 확인과 함께 홈으로 나가는 길을 둔다", async () => {
    eligibilityHarness.current = {
      activeRoundId: null,
      capabilities: [],
      eligible: false,
      evaluatedAt: "2026-10-27T00:00:00Z",
      nextAction: "COMPLETE_CURRENT_SURVEY",
      reason: null,
      surveyRequirement: null,
    };

    renderCompletion({
      status: "SUBMITTED",
      persisted: true,
      replayed: false,
      responseId: "33333333-3333-4333-8333-333333333333",
      roundId: "11111111-1111-4111-8111-111111111111",
      contentVersionId: "22222222-2222-4222-8222-222222222222",
      submittedAt: "2026-10-27T00:00:00Z",
    });

    expect(await screen.findByRole("button", { name: "다시 확인" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "홈으로" }).getAttribute("href")).toBe("/home");
  });
});

function renderCompletion(result: SubmissionResponse) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <SurveySubmissionCompletion
        failureAnalytics={failureAnalytics}
        result={result}
        returnTo="/chat"
      />
    </QueryClientProvider>,
  );
}
