"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import {
  sendGoogleAnalyticsEvent,
  type GoogleAnalyticsTarget,
} from "@/lib/analytics/google-analytics";
import {
  createVoteParticipationAnalyticsSession,
  resolveVoteInitialAiState,
  type VoteParticipationAnalyticsSession,
  type VoteParticipationStep,
} from "@/lib/vote/vote-participation-analytics";

type VoteParticipationAnalyticsSessionRef = Readonly<{
  session: VoteParticipationAnalyticsSession;
  taskId: string;
}>;

export function useVoteParticipationAnalytics({
  flowVisible,
  participationReady,
  predictionPreparationFailed,
  step,
  taskId,
}: Readonly<{
  flowVisible: boolean;
  participationReady: boolean;
  predictionPreparationFailed: boolean;
  step: VoteParticipationStep;
  taskId: string;
}>) {
  const pageVisible = useSyncExternalStore(
    subscribeToDocumentVisibility,
    getDocumentVisibilitySnapshot,
    getDocumentVisibilityServerSnapshot,
  );
  const sessionRef = useRef<VoteParticipationAnalyticsSessionRef | null>(null);

  const getSession = useCallback(() => {
    const current = sessionRef.current;
    if (current?.taskId === taskId) return current.session;

    const session = createVoteParticipationAnalyticsSession({
      sendEvent: (eventName, parameters) =>
        sendGoogleAnalyticsEvent(window as GoogleAnalyticsTarget, eventName, parameters),
      taskId,
      visitId: crypto.randomUUID(),
    });
    sessionRef.current = { session, taskId };
    return session;
  }, [taskId]);

  const initialAiState = resolveVoteInitialAiState({
    participationReady,
    preparationFailed: predictionPreparationFailed,
  });

  useEffect(() => {
    if (!flowVisible || !pageVisible) return;
    getSession().trackStepViewed(step, step === 1 ? initialAiState : undefined);
  }, [flowVisible, getSession, initialAiState, pageVisible, step]);

  useEffect(() => {
    if (!flowVisible || !pageVisible || step !== 1 || !participationReady) return;
    getSession().trackParticipationReady();
  }, [flowVisible, getSession, pageVisible, participationReady, step]);

  const trackSubmissionAttempted = useCallback(() => {
    getSession().trackSubmissionAttempted();
  }, [getSession]);

  return { trackSubmissionAttempted };
}

function subscribeToDocumentVisibility(listener: () => void): () => void {
  document.addEventListener("visibilitychange", listener);
  return () => document.removeEventListener("visibilitychange", listener);
}

function getDocumentVisibilitySnapshot(): boolean {
  return document.visibilityState === "visible";
}

function getDocumentVisibilityServerSnapshot(): boolean {
  return false;
}
