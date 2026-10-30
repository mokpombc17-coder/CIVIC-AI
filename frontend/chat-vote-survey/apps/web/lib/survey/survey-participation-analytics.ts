import type { GoogleAnalyticsEventParameters } from "@/lib/analytics/google-analytics";

export type SurveyEntryType = "new" | "resumed";
export type SurveyStepExitType = "leave" | "next" | "previous" | "submit";

export type SurveyAnalyticsEventSender = (
  eventName: string,
  parameters: GoogleAnalyticsEventParameters,
) => boolean;

type SurveyParticipationAnalyticsSessionOptions = Readonly<{
  entryType: SurveyEntryType;
  now?: () => number;
  sendEvent: SurveyAnalyticsEventSender;
  surveyId: string;
  surveyVersion: string;
  totalSteps: number;
  visitId: string;
}>;

type ActiveSurveyStep = {
  activeDurationMs: number;
  activeStartedAt: number | null;
  step: number;
  stepId: string;
  stepVisitNumber: number;
};

export type SurveyParticipationAnalyticsSession = Readonly<{
  setPageVisible: (visible: boolean) => void;
  trackStepExited: (exitType: SurveyStepExitType) => boolean;
  trackStepViewed: (step: number, stepId: string) => boolean;
  trackSubmissionAttempted: () => boolean;
}>;

export function createSurveyParticipationAnalyticsSession({
  entryType,
  now = Date.now,
  sendEvent,
  surveyId,
  surveyVersion,
  totalSteps,
  visitId,
}: SurveyParticipationAnalyticsSessionOptions): SurveyParticipationAnalyticsSession {
  const viewedSteps = new Set<number>();
  const stepVisitCounts = new Map<number, number>();
  let activeStep: ActiveSurveyStep | null = null;
  let pageVisible = false;
  let submissionAttemptNumber = 0;

  const commonParameters = {
    entry_type: entryType,
    survey_id: surveyId,
    survey_version: surveyVersion,
    total_steps: totalSteps,
    visit_id: visitId,
  } as const;

  function pauseActiveStep(): void {
    if (!activeStep || activeStep.activeStartedAt === null) return;
    activeStep.activeDurationMs += Math.max(0, now() - activeStep.activeStartedAt);
    activeStep.activeStartedAt = null;
  }

  return {
    setPageVisible(visible) {
      if (pageVisible === visible) return;
      pageVisible = visible;
      if (!visible) {
        pauseActiveStep();
        return;
      }
      if (activeStep && activeStep.activeStartedAt === null) activeStep.activeStartedAt = now();
    },

    trackStepExited(exitType) {
      if (!activeStep) return false;
      pauseActiveStep();

      const exitedStep = activeStep;
      activeStep = null;
      return sendEvent("survey_step_exited", {
        ...commonParameters,
        active_duration_ms: Math.max(0, exitedStep.activeDurationMs),
        exit_type: exitType,
        step: exitedStep.step,
        step_id: exitedStep.stepId,
        step_visit_number: exitedStep.stepVisitNumber,
      });
    },

    trackStepViewed(step, stepId) {
      if (!Number.isInteger(step) || step < 1 || step > totalSteps || !stepId) return false;

      if (activeStep?.step !== step) {
        const stepVisitNumber = (stepVisitCounts.get(step) ?? 0) + 1;
        stepVisitCounts.set(step, stepVisitNumber);
        activeStep = {
          activeDurationMs: 0,
          activeStartedAt: pageVisible ? now() : null,
          step,
          stepId,
          stepVisitNumber,
        };
      }

      if (viewedSteps.has(step)) return false;
      const sent = sendEvent("survey_step_view", {
        ...commonParameters,
        step,
        step_id: stepId,
      });
      if (sent) viewedSteps.add(step);
      return sent;
    },

    trackSubmissionAttempted() {
      submissionAttemptNumber += 1;
      return sendEvent("survey_submission_attempted", {
        ...commonParameters,
        attempt_number: submissionAttemptNumber,
      });
    },
  };
}
