"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { storeAnalyticsUserId } from "@/lib/analytics/user-id";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";
import {
  isServiceEligibilityGuardExemptPath,
  loadServiceEligibility,
  requiresCurrentSurvey,
  serviceEligibilityQueryKey,
  serviceEligibilityStaleTimeMs,
  surveyLocation,
} from "@/lib/vote/service-eligibility";

const eligibilityLoadingDelayMs = 200;
const eligibilityLoadingMinimumVisibleMs = 200;

export function ParticipantEligibilityGuard({
  activeRoute,
  children,
  loadingFallback,
}: Readonly<{ activeRoute: string; children: ReactNode; loadingFallback?: ReactNode }>) {
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
  const bypassGuard =
    exempt || currentUser.isError || (currentUser.isSuccess && !participant) || eligibility.isError;
  const eligibilityPending =
    !bypassGuard && (currentUser.isPending || eligibility.isPending || surveyRequired);
  const loading = useDelayedEligibilityLoading(eligibilityPending);

  useEffect(() => {
    if (!surveyRequired) return;
    const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.replace(surveyLocation(returnTo));
  }, [surveyRequired]);

  if (bypassGuard) return children;
  if (loading.blockContent) {
    if (loadingFallback !== undefined) return loadingFallback;
    return (
      <div aria-busy="true" className="civic-eligibility-loading" data-eligibility-loading="true">
        {loading.showIndicator ? (
          <div
            aria-live="polite"
            className="civic-eligibility-loading-status"
            data-eligibility-loading-indicator="true"
            role="status"
          >
            <span aria-hidden="true" className="civic-eligibility-loading-spinner" />
            <p>{surveyRequired ? "필수 설문 화면으로 이동하고 있습니다…" : "이용 자격 확인 중…"}</p>
          </div>
        ) : null}
      </div>
    );
  }
  return children;
}

function useDelayedEligibilityLoading(isBlocking: boolean): Readonly<{
  blockContent: boolean;
  showIndicator: boolean;
}> {
  const [indicatorVisible, setIndicatorVisible] = useState(false);
  const [minimumVisibleElapsed, setMinimumVisibleElapsed] = useState(false);

  useEffect(() => {
    if (!isBlocking || indicatorVisible) return;
    const delay = window.setTimeout(() => {
      setIndicatorVisible(true);
    }, eligibilityLoadingDelayMs);
    return () => window.clearTimeout(delay);
  }, [indicatorVisible, isBlocking]);

  useEffect(() => {
    if (!indicatorVisible) return;
    const minimumVisible = window.setTimeout(() => {
      setMinimumVisibleElapsed(true);
    }, eligibilityLoadingMinimumVisibleMs);
    return () => window.clearTimeout(minimumVisible);
  }, [indicatorVisible]);

  const blockContent = isBlocking || (indicatorVisible && !minimumVisibleElapsed);

  useEffect(() => {
    if (blockContent || !indicatorVisible) return;
    const reset = window.setTimeout(() => {
      setIndicatorVisible(false);
      setMinimumVisibleElapsed(false);
    }, 0);
    return () => window.clearTimeout(reset);
  }, [blockContent, indicatorVisible]);

  return { blockContent, showIndicator: indicatorVisible };
}

async function loadCurrentUserRole(): Promise<string | null> {
  const response = await authenticatedFetch("/api/v1/auth/me", { cache: "no-store" });
  if (!response.ok) throw new Error("로그인 정보를 확인하지 못했습니다.");
  const currentUser = (await response.json().catch(() => null)) as {
    role?: unknown;
    user_id?: unknown;
  } | null;
  storeAnalyticsUserId(currentUser?.user_id);
  return typeof currentUser?.role === "string" ? currentUser.role : null;
}
