"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { PlatformPageShell } from "@/components/platform-page-shell";
import {
  getServiceEligibilityQueryOptions,
  requiresCurrentSurvey,
} from "@/lib/vote/service-eligibility";
import {
  createEligibilityLoginLocation,
  createRequiredSurveyLocation,
  getCurrentDocumentPath,
} from "@/lib/vote/service-eligibility-navigation";
import { VoteApiError } from "@/lib/vote/vote-fetch";
import styles from "./service-eligibility-guard.module.css";

type ServiceEligibilityGuardProps = Readonly<{
  children: ReactNode;
  title: string;
}>;

const eligibilityLoadingDelayMs = 200;
const eligibilityLoadingMinimumVisibleMs = 200;

export function ServiceEligibilityGuard({ children, title }: ServiceEligibilityGuardProps) {
  const eligibilityQuery = useQuery(getServiceEligibilityQueryOptions());
  const surveyRequired = eligibilityQuery.data
    ? requiresCurrentSurvey(eligibilityQuery.data)
    : false;
  const loading = useDelayedEligibilityLoading(eligibilityQuery.isPending || surveyRequired);

  useEffect(() => {
    if (!surveyRequired) return;

    const returnTo = getCurrentDocumentPath(window.location);
    window.location.replace(createRequiredSurveyLocation(returnTo));
  }, [surveyRequired]);

  if (loading.blockContent) {
    return (
      <ServiceEligibilityStatus
        loading
        redirecting={surveyRequired}
        showIndicator={loading.showIndicator}
        title={title}
      />
    );
  }

  if (eligibilityQuery.isError) {
    const authenticationRequired =
      eligibilityQuery.error instanceof VoteApiError && eligibilityQuery.error.status === 401;
    const returnTo = getCurrentDocumentPath(window.location);

    return (
      <ServiceEligibilityStatus
        action={
          authenticationRequired ? (
            <a className={styles.action} href={createEligibilityLoginLocation(returnTo)}>
              로그인하기
            </a>
          ) : (
            <button
              className={styles.action}
              onClick={() => void eligibilityQuery.refetch()}
              type="button"
            >
              다시 시도
            </button>
          )
        }
        description={
          authenticationRequired
            ? "로그인 후 서비스를 이용할 수 있습니다."
            : "잠시 후 다시 시도해 주세요."
        }
        role="alert"
        title={title}
        statusTitle={
          authenticationRequired
            ? "로그인이 필요합니다."
            : "서비스 이용 가능 여부를 확인하지 못했습니다."
        }
      />
    );
  }

  return children;
}

export function ServiceEligibilityStatus({
  action,
  description = "이용 자격 확인 중…",
  loading = false,
  redirecting = false,
  role = "status",
  showIndicator = true,
  statusTitle = "서비스 이용 여부를 확인하는 중입니다.",
  title,
}: Readonly<{
  action?: ReactNode;
  description?: string;
  loading?: boolean;
  redirecting?: boolean;
  role?: "alert" | "status";
  showIndicator?: boolean;
  statusTitle?: string;
  title: string;
}>) {
  const status = loading ? "loading" : "error";

  return (
    <PlatformPageShell contentClassName={styles.content!} title={title}>
      <div
        aria-busy={loading || undefined}
        className={styles.loading}
        data-eligibility-loading={loading || undefined}
        data-service-eligibility-status={status}
      >
        {showIndicator ? (
          <section
            aria-live={loading ? "polite" : undefined}
            className={styles.loadingStatus}
            data-eligibility-loading-indicator={loading || undefined}
            role={role}
          >
            {loading ? <span aria-hidden="true" className={styles.loadingSpinner} /> : null}
            {loading ? null : <h2>{statusTitle}</h2>}
            <p>{redirecting ? "필수 설문 화면으로 이동하고 있습니다…" : description}</p>
            {action ? <div className={styles.actions}>{action}</div> : null}
          </section>
        ) : null}
      </div>
    </PlatformPageShell>
  );
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
