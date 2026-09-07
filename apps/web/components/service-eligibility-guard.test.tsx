import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ServiceEligibilityGuard, ServiceEligibilityStatus } from "./service-eligibility-guard";
import { serviceEligibilityQueryKey } from "@/lib/vote/service-eligibility";

vi.mock("next/navigation", () => ({
  usePathname: () => "/chat",
}));

const eligibilityBase = {
  activeRoundId: "11111111-1111-4111-8111-111111111111",
  capabilities: ["USE_GENERAL_SERVICE"],
  evaluatedAt: "2026-09-03T00:00:00Z",
  reason: null,
  surveyRequirement: "SATISFIED",
} as const;

describe("ServiceEligibilityGuard", () => {
  it("eligibility 확인 중에는 Platform Shell을 유지하고 보호 콘텐츠를 숨긴다", () => {
    const queryClient = createTestQueryClient();

    const markup = renderGuard(queryClient);

    expect(markup).toContain('data-platform-shell="true"');
    expect(markup).toContain('data-eligibility-loading="true"');
    expect(markup).not.toContain("protected content");
  });

  it("route가 전용 fallback을 제공하면 eligibility 확인 중에도 같은 화면을 유지한다", () => {
    const queryClient = createTestQueryClient();

    const markup = renderGuard(queryClient, <div data-route-loading="vote">투표 목록 자리</div>);

    expect(markup).toContain('data-route-loading="vote"');
    expect(markup).not.toContain("data-service-eligibility-status");
    expect(markup).not.toContain("protected content");
  });

  it("이용 가능한 사용자에게 보호 콘텐츠를 표시한다", () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(serviceEligibilityQueryKey, {
      ...eligibilityBase,
      eligible: true,
      nextAction: null,
    });

    const markup = renderGuard(queryClient);

    expect(markup).toContain("protected content");
    expect(markup).not.toContain("data-service-eligibility-status");
  });

  it("설문이 필요한 사용자의 보호 콘텐츠를 리다이렉트 전에도 숨긴다", () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(serviceEligibilityQueryKey, {
      ...eligibilityBase,
      eligible: false,
      nextAction: "COMPLETE_CURRENT_SURVEY",
      reason: "CURRENT_SURVEY_RESPONSE_REQUIRED",
      surveyRequirement: "REQUIRED",
    });

    const markup = renderGuard(queryClient);

    expect(markup).toContain('data-eligibility-loading="true"');
    expect(markup).not.toContain("protected content");
  });

  it("3000 Guard와 동일한 로딩 문구와 indicator 구조를 사용한다", () => {
    const markup = renderToStaticMarkup(
      <ServiceEligibilityStatus loading showIndicator title="토론방" />,
    );

    expect(markup).toContain('data-eligibility-loading="true"');
    expect(markup).toContain('data-eligibility-loading-indicator="true"');
    expect(markup).toContain("이용 자격 확인 중…");
  });

  it("오류 상태는 보호 콘텐츠 대신 재시도 동선을 표시한다", () => {
    const markup = renderToStaticMarkup(
      <ServiceEligibilityStatus
        action={<button type="button">다시 시도</button>}
        description="잠시 후 다시 시도해 주세요."
        role="alert"
        statusTitle="서비스 이용 가능 여부를 확인하지 못했습니다."
        title="토론방"
      />,
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("서비스 이용 가능 여부를 확인하지 못했습니다.");
    expect(markup).toContain("다시 시도");
  });
});

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
      },
    },
  });
}

function renderGuard(queryClient: QueryClient, loadingFallback?: ReactNode): string {
  const request = vi.fn(() => new Promise<never>(() => {}));
  queryClient.setDefaultOptions({
    queries: {
      queryFn: request,
      retry: false,
      staleTime: Number.POSITIVE_INFINITY,
    },
  });

  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <ServiceEligibilityGuard loadingFallback={loadingFallback} title="토론방">
        protected content
      </ServiceEligibilityGuard>
    </QueryClientProvider>,
  );
}
