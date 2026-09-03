"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { PlatformPageShell } from "@/components/platform-page-shell";
import {
  requiresCurrentSurvey,
  serviceEligibilityApi,
  serviceEligibilityQueryKey,
  serviceEligibilityStaleTimeMs,
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

export function ServiceEligibilityGuard({ children, title }: ServiceEligibilityGuardProps) {
  const eligibilityQuery = useQuery({
    queryKey: serviceEligibilityQueryKey,
    queryFn: ({ signal }) => serviceEligibilityApi.getCurrent(signal),
    staleTime: serviceEligibilityStaleTimeMs,
  });
  const surveyRequired = eligibilityQuery.data
    ? requiresCurrentSurvey(eligibilityQuery.data)
    : false;

  useEffect(() => {
    if (!surveyRequired) return;

    const returnTo = getCurrentDocumentPath(window.location);
    window.location.replace(createRequiredSurveyLocation(returnTo));
  }, [surveyRequired]);

  if (eligibilityQuery.isPending || surveyRequired) {
    return <ServiceEligibilityStatus loading title={title} />;
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
  description = "서비스 이용 가능 여부를 확인하고 있습니다.",
  loading = false,
  role = "status",
  statusTitle = "서비스 이용 여부를 확인하는 중입니다.",
  title,
}: Readonly<{
  action?: ReactNode;
  description?: string;
  loading?: boolean;
  role?: "alert" | "status";
  statusTitle?: string;
  title: string;
}>) {
  return (
    <PlatformPageShell contentClassName={styles.content!} title={title}>
      <div className={styles.surface}>
        <section
          aria-busy={loading || undefined}
          className={styles.statusCard}
          data-service-eligibility-status={loading ? "loading" : "error"}
          role={role}
        >
          {loading ? <span aria-hidden="true" className={styles.loadingSpinner} /> : null}
          <h2>{statusTitle}</h2>
          <p>{description}</p>
          {action ? <div className={styles.actions}>{action}</div> : null}
        </section>
      </div>
    </PlatformPageShell>
  );
}
