import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ParticipantShell } from "@/components/shell/participant-shell";

describe("ParticipantEligibilityGuard", () => {
  it("keeps the participant Platform Shell while withholding protected content", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const markup = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <ParticipantShell activeRoute="/home" enforceServiceEligibility>
          protected participant content
        </ParticipantShell>
      </QueryClientProvider>,
    );

    expect(markup).toContain('data-platform-shell="true"');
    expect(markup).toContain('aria-label="참여자 주요 메뉴"');
    expect(markup).toContain('data-eligibility-loading="true"');
    expect(markup).not.toContain("protected participant content");
    expect(markup).not.toContain("이용 자격 확인 중…");
  });
});
