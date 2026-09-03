import type { SubmissionResponse } from "./survey-contracts";
import type { ServiceEligibility } from "@/lib/vote/service-eligibility";

export function canReturnAfterSurveySubmission(
  result: SubmissionResponse,
  eligibility: ServiceEligibility | undefined,
): boolean {
  return result.persisted && eligibility?.eligible === true;
}
