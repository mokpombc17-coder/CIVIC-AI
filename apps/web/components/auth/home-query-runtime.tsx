"use client";

import { ParticipantEligibilityGuard } from "@/components/auth/participant-eligibility-guard";
import { AppQueryProvider } from "@/components/providers/app-query-provider";

export function HomeQueryRuntime({ authenticated }: Readonly<{ authenticated: boolean }>) {
  return (
    <AppQueryProvider>
      {authenticated ? (
        <ParticipantEligibilityGuard activeRoute="/home" loadingFallback={null}>
          {null}
        </ParticipantEligibilityGuard>
      ) : null}
    </AppQueryProvider>
  );
}
