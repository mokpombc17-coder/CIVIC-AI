"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";
import {
  isServiceEligibilityGuardExemptPath,
  loadServiceEligibility,
  requiresCurrentSurvey,
  serviceEligibilityQueryKey,
  serviceEligibilityStaleTimeMs,
  surveyLocation,
} from "@/lib/vote/service-eligibility";

export function ParticipantEligibilityGuard({
  activeRoute,
  children,
}: Readonly<{ activeRoute: string; children: ReactNode }>) {
  const exempt = isServiceEligibilityGuardExemptPath(activeRoute);
  const currentUser = useQuery({
    enabled: !exempt,
    queryFn: loadCurrentUserRole,
    queryKey: ["current-user", "role"],
    staleTime: serviceEligibilityStaleTimeMs,
  });
  const participant = currentUser.data === "PARTICIPANT";
  const eligibility = useQuery({
    enabled: !exempt && participant,
    queryFn: () => loadServiceEligibility(),
    queryKey: serviceEligibilityQueryKey,
    staleTime: serviceEligibilityStaleTimeMs,
  });
  const surveyRequired = eligibility.data ? requiresCurrentSurvey(eligibility.data) : false;

  useEffect(() => {
    if (!surveyRequired) return;
    const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.replace(surveyLocation(returnTo));
  }, [surveyRequired]);

  if (exempt || currentUser.isError || (currentUser.isSuccess && !participant)) return children;
  if (currentUser.isPending || eligibility.isPending || surveyRequired) {
    return (
      <main aria-busy="true" aria-live="polite" className="civic-route-loading">
        <p>
          {surveyRequired
            ? "필수 설문 화면으로 이동하고 있습니다…"
            : "이용 자격을 확인하고 있습니다…"}
        </p>
      </main>
    );
  }
  return children;
}

async function loadCurrentUserRole(): Promise<string | null> {
  const response = await authenticatedFetch("/api/v1/auth/me", { cache: "no-store" });
  if (!response.ok) throw new Error("로그인 정보를 확인하지 못했습니다.");
  const currentUser = (await response.json().catch(() => null)) as { role?: unknown } | null;
  return typeof currentUser?.role === "string" ? currentUser.role : null;
}
