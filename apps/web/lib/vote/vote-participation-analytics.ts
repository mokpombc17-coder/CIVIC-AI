import type { GoogleAnalyticsEventParameters } from "@/lib/analytics/google-analytics";

export type VoteParticipationStep = 1 | 2 | 3 | 4;
export type VoteInitialAiState = "ready" | "waiting" | "failed";

export type VoteAnalyticsEventSender = (
  eventName: string,
  parameters: GoogleAnalyticsEventParameters,
) => boolean;

type VoteParticipationAnalyticsSessionOptions = Readonly<{
  now?: () => number;
  sendEvent: VoteAnalyticsEventSender;
  taskId: string;
  visitId: string;
}>;

export type VoteParticipationAnalyticsSession = Readonly<{
  trackParticipationReady: () => boolean;
  trackStepViewed: (step: VoteParticipationStep, initialAiState?: VoteInitialAiState) => boolean;
  trackSubmissionAttempted: () => boolean;
}>;

export function resolveVoteInitialAiState({
  participationReady,
  preparationFailed,
}: Readonly<{
  participationReady: boolean;
  preparationFailed: boolean;
}>): VoteInitialAiState {
  if (participationReady) return "ready";
  return preparationFailed ? "failed" : "waiting";
}

export function createVoteParticipationAnalyticsSession({
  now = Date.now,
  sendEvent,
  taskId,
  visitId,
}: VoteParticipationAnalyticsSessionOptions): VoteParticipationAnalyticsSession {
  const viewedSteps = new Set<VoteParticipationStep>();
  let participationReadyTracked = false;
  let stepOneViewedAt: number | null = null;
  let submissionAttemptNumber = 0;

  return {
    trackStepViewed(step, initialAiState) {
      if (viewedSteps.has(step)) return false;
      if (step === 1 && !initialAiState) return false;

      const viewedAt = now();
      const sent = sendEvent("vote_step_view", {
        ...(step === 1 ? { initial_ai_state: initialAiState! } : {}),
        step,
        task_id: taskId,
        visit_id: visitId,
      });
      if (!sent) return false;

      viewedSteps.add(step);
      if (step === 1) stepOneViewedAt = viewedAt;
      return true;
    },

    trackParticipationReady() {
      if (participationReadyTracked || stepOneViewedAt === null) return false;

      const sent = sendEvent("vote_participation_ready", {
        task_id: taskId,
        visit_id: visitId,
        wait_duration_ms: Math.max(0, now() - stepOneViewedAt),
      });
      if (!sent) return false;

      participationReadyTracked = true;
      return true;
    },

    trackSubmissionAttempted() {
      submissionAttemptNumber += 1;
      return sendEvent("vote_submission_attempted", {
        attempt_number: submissionAttemptNumber,
        task_id: taskId,
        visit_id: visitId,
      });
    },
  };
}
