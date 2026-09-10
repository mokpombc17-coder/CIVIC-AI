import { ParticipantEligibilityGuard } from "@/components/auth/participant-eligibility-guard";
import { AppQueryProvider } from "@/components/providers/app-query-provider";
import { ParticipantShell, type ParticipantShellProps } from "@/components/shell/participant-shell";

export function EligibleParticipantShell({
  activeRoute,
  children,
  ...shellProps
}: ParticipantShellProps) {
  return (
    <ParticipantShell {...shellProps} activeRoute={activeRoute}>
      <AppQueryProvider>
        <ParticipantEligibilityGuard activeRoute={activeRoute}>
          {children}
        </ParticipantEligibilityGuard>
      </AppQueryProvider>
    </ParticipantShell>
  );
}
