import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  getFeatureFailureDetails,
  type FeatureFailureAnalyticsSession,
} from "@/lib/analytics/feature-failure-analytics";
import type { SubmissionResponse } from "@/lib/survey/survey-contracts";
import { canReturnAfterSurveySubmission } from "@/lib/survey/survey-completion";
import { SURVEY_EXIT_PATH } from "@/lib/survey/survey-navigation";
import { getServiceEligibilityQueryOptions } from "@/lib/vote/service-eligibility";
import { SurveyStatus } from "./survey-status";
import styles from "./survey.module.css";

export function SurveySubmissionCompletion({
  failureAnalytics,
  result,
  returnTo,
}: Readonly<{
  failureAnalytics: FeatureFailureAnalyticsSession;
  result: SubmissionResponse;
  returnTo: string;
}>) {
  const eligibilityQuery = useQuery({
    ...getServiceEligibilityQueryOptions(),
    enabled: result.persisted,
    staleTime: 0,
  });
  const canReturn =
    eligibilityQuery.isSuccess &&
    !eligibilityQuery.isFetching &&
    canReturnAfterSurveySubmission(result, eligibilityQuery.data);

  useEffect(() => {
    if (!result.persisted || eligibilityQuery.isFetching) return;
    if (canReturn) {
      failureAnalytics.trackRecovered("post-submit-check");
      return;
    }
    if (eligibilityQuery.isError || eligibilityQuery.isSuccess) {
      const details = eligibilityQuery.isError
        ? getFeatureFailureDetails(eligibilityQuery.error, "api", "eligibility_check_failed")
        : {
            errorCode: "eligibility_not_ready",
            errorSource: "api" as const,
            retryable: true,
          };
      failureAnalytics.trackFailure({
        ...details,
        incidentKey: "post-submit-check",
        operation: "post_submit_check",
        retryCount: Math.max(0, eligibilityQuery.failureCount - 1),
        surface: "completion",
      });
    }
  }, [
    canReturn,
    eligibilityQuery.error,
    eligibilityQuery.failureCount,
    eligibilityQuery.isError,
    eligibilityQuery.isFetching,
    eligibilityQuery.isSuccess,
    failureAnalytics,
    result.persisted,
  ]);

  useEffect(() => {
    if (!canReturn) return;
    window.location.replace(returnTo);
  }, [canReturn, returnTo]);

  if (!result.persisted) {
    return (
      <SurveyStatus
        actions={
          <a className={`${styles.action} ${styles.primaryAction}`} href={SURVEY_EXIT_PATH}>
            홈으로
          </a>
        }
        description="미리보기 응답은 저장되지 않습니다."
        icon={<span aria-hidden="true" className={styles.submittedIcon} />}
        title="설문 응답 검증을 완료했습니다."
      />
    );
  }

  if (eligibilityQuery.isFetching || canReturn) {
    return (
      <SurveyStatus
        description="서비스 이용 가능 여부를 확인하고 있습니다."
        loading
        title="설문 제출을 완료했습니다."
      />
    );
  }

  // 완료 상태가 계속 반영되지 않아도 갇히지 않도록 설문 없이 들어갈 수 있는 홈으로 나가는 길을 둠
  return (
    <SurveyStatus
      actions={
        <>
          <button
            className={`${styles.action} ${styles.primaryAction}`}
            onClick={() => {
              failureAnalytics.trackRecoveryAttempt("post-submit-check", "user_retry");
              void eligibilityQuery.refetch();
            }}
            type="button"
          >
            다시 확인
          </button>
          <a className={`${styles.action} ${styles.secondaryAction}`} href={SURVEY_EXIT_PATH}>
            홈으로
          </a>
        </>
      }
      description="완료 상태가 아직 반영되지 않았습니다. 잠시 후 다시 확인해 주세요."
      icon={<span aria-hidden="true" className={styles.submittedIcon} />}
      role="alert"
      title="설문 제출을 완료했습니다."
    />
  );
}
