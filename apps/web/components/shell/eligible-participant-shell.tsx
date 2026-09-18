import type { ReactNode } from "react";
import { ParticipantEligibilityGuard } from "@/components/auth/participant-eligibility-guard";
import { AppQueryProvider } from "@/components/providers/app-query-provider";
import { ParticipantShell, type ParticipantShellProps } from "@/components/shell/participant-shell";

export function EligibleParticipantShell({
  activeRoute,
  children,
  eligibilityLoadingFallback,
  ...shellProps
}: ParticipantShellProps & Readonly<{ eligibilityLoadingFallback?: ReactNode }>) {
  return (
    <ParticipantShell {...shellProps} activeRoute={activeRoute}>
      <AppQueryProvider>
        <ParticipantEligibilityGuard
          activeRoute={activeRoute}
          {...(eligibilityLoadingFallback !== undefined
            ? { loadingFallback: eligibilityLoadingFallback }
            : {})}
        >
          {children}
        </ParticipantEligibilityGuard>
      </AppQueryProvider>
    </ParticipantShell>
  );
}
