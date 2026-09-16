"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import {
  sendGoogleAnalyticsEvent,
  type GoogleAnalyticsTarget,
} from "@/lib/analytics/google-analytics";
import {
  createSurveyParticipationAnalyticsSession,
  type SurveyEntryType,
  type SurveyParticipationAnalyticsSession,
  type SurveyStepExitType,
} from "@/lib/survey/survey-participation-analytics";

type SurveyParticipationAnalyticsSessionRef = Readonly<{
  key: string;
  session: SurveyParticipationAnalyticsSession;
}>;

export function useSurveyParticipationAnalytics({
  currentStep,
  entryType,
  flowVisible,
  stepId,
  surveyId,
  surveyVersion,
  totalSteps,
}: Readonly<{
  currentStep: number;
  entryType: SurveyEntryType | null;
  flowVisible: boolean;
  stepId: string;
  surveyId: string;
  surveyVersion: string;
  totalSteps: number;
}>) {
  const pageVisible = useSyncExternalStore(
    subscribeToDocumentVisibility,
    getDocumentVisibilitySnapshot,
    getDocumentVisibilityServerSnapshot,
  );
  const sessionRef = useRef<SurveyParticipationAnalyticsSessionRef | null>(null);
  const previousStepRef = useRef<number | null>(null);

  const getSession = useCallback(() => {
    if (!entryType) return null;
    const key = `${surveyId}:${surveyVersion}:${entryType}`;
    const current = sessionRef.current;
    if (current?.key === key) return current.session;

    const session = createSurveyParticipationAnalyticsSession({
      entryType,
      sendEvent: (eventName, parameters) =>
        sendGoogleAnalyticsEvent(window as GoogleAnalyticsTarget, eventName, parameters),
      surveyId,
      surveyVersion,
      totalSteps,
      visitId: crypto.randomUUID(),
    });
    sessionRef.current = { key, session };
    previousStepRef.current = null;
    return session;
  }, [entryType, surveyId, surveyVersion, totalSteps]);

  useEffect(() => {
    if (!flowVisible) return;
    const session = getSession();
    if (!session) return;

    session.setPageVisible(pageVisible);
    if (!pageVisible) return;
    const previousStep = previousStepRef.current;
    if (previousStep !== null && previousStep !== currentStep) {
      session.trackStepExited(currentStep > previousStep ? "next" : "previous");
    }
    session.trackStepViewed(currentStep, stepId);
    previousStepRef.current = currentStep;
  }, [currentStep, flowVisible, getSession, pageVisible, stepId]);

  useEffect(() => {
    if (!flowVisible) return;
    const session = getSession();
    if (!session) return;

    const trackLeave = () => session.trackStepExited("leave");
    window.addEventListener("pagehide", trackLeave);
    return () => {
      window.removeEventListener("pagehide", trackLeave);
      trackLeave();
    };
  }, [flowVisible, getSession]);

  const trackStepExited = useCallback(
    (exitType: SurveyStepExitType) => getSession()?.trackStepExited(exitType) ?? false,
    [getSession],
  );
  const trackSubmissionAttempted = useCallback(
    () => getSession()?.trackSubmissionAttempted() ?? false,
    [getSession],
  );

  return { trackStepExited, trackSubmissionAttempted };
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
