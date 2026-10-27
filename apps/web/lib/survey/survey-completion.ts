import type { SubmissionResponse } from "./survey-contracts";
import { requiresCurrentSurvey, type ServiceEligibility } from "@/lib/vote/service-eligibility";

// 설문 때문에 막힌 상태가 풀렸으면 원래 화면으로 돌려보냄
// 서비스 관문(ServiceEligibilityGuard)과 같은 기준을 써야 함. 다른 이유로 이용할 수 없는 상태까지 막으면
// 관문은 들여보낼 사용자를 완료 화면이 붙잡아 나갈 수 없게 됨
export function canReturnAfterSurveySubmission(
  result: SubmissionResponse,
  eligibility: ServiceEligibility | undefined,
): boolean {
  return result.persisted && eligibility !== undefined && !requiresCurrentSurvey(eligibility);
}
