import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ParticipantEligibilityGuard } from "@/components/auth/participant-eligibility-guard";
import { EligibleParticipantShell } from "@/components/shell/eligible-participant-shell";

describe("ParticipantEligibilityGuard", () => {
  it("keeps the participant Platform Shell while withholding protected content", () => {
    const markup = renderToStaticMarkup(
      <EligibleParticipantShell activeRoute="/home">
        protected participant content
      </EligibleParticipantShell>,
    );

    expect(markup).toContain('data-platform-shell="true"');
    expect(markup).toContain('aria-label="참여자 주요 메뉴"');
    expect(markup).toContain('data-eligibility-loading="true"');
    expect(markup).not.toContain("protected participant content");
    expect(markup).not.toContain("이용 자격 확인 중…");
  });

  it("uses a route-owned stable fallback while eligibility is pending", () => {
    const markup = renderToStaticMarkup(
      <EligibleParticipantShell
        activeRoute="/rag"
        eligibilityLoadingFallback={<p>empty RAG surface</p>}
      >
        protected RAG conversation
      </EligibleParticipantShell>,
    );

    expect(markup).toContain("empty RAG surface");
    expect(markup).not.toContain("protected RAG conversation");
    expect(markup).not.toContain('data-eligibility-loading="true"');
  });

  it("allows eligibility checks to run without replacing an independently rendered surface", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const markup = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <main>public landing content</main>
        <ParticipantEligibilityGuard activeRoute="/home" loadingFallback={null}>
          {null}
        </ParticipantEligibilityGuard>
      </QueryClientProvider>,
    );

    expect(markup).toContain("public landing content");
    expect(markup).not.toContain('data-eligibility-loading="true"');
  });
});
