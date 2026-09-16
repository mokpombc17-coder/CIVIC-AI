"use client";

import { useCallback, useMemo, useRef } from "react";
import {
  sendGoogleAnalyticsEvent,
  type GoogleAnalyticsTarget,
} from "@/lib/analytics/google-analytics";
import {
  createFeatureFailureAnalyticsSession,
  type FeatureFailureAnalyticsSession,
  type FeatureFailureDomain,
} from "@/lib/analytics/feature-failure-analytics";

type FeatureFailureAnalyticsSessionRef = Readonly<{
  key: string;
  session: FeatureFailureAnalyticsSession;
}>;

export function useFeatureFailureAnalytics(
  domain: FeatureFailureDomain,
  sessionKey: string,
): FeatureFailureAnalyticsSession {
  const sessionRef = useRef<FeatureFailureAnalyticsSessionRef | null>(null);

  const getSession = useCallback(() => {
    const key = `${domain}:${sessionKey}`;
    const current = sessionRef.current;
    if (current?.key === key) return current.session;

    const session = createFeatureFailureAnalyticsSession({
      domain,
      sendEvent: (eventName, parameters) =>
        sendGoogleAnalyticsEvent(window as GoogleAnalyticsTarget, eventName, parameters),
      visitId: crypto.randomUUID(),
    });
    sessionRef.current = { key, session };
    return session;
  }, [domain, sessionKey]);

  const trackFailure = useCallback(
    (...args: Parameters<FeatureFailureAnalyticsSession["trackFailure"]>) =>
      getSession().trackFailure(...args),
    [getSession],
  );
  const trackRecovered = useCallback(
    (...args: Parameters<FeatureFailureAnalyticsSession["trackRecovered"]>) =>
      getSession().trackRecovered(...args),
    [getSession],
  );
  const trackRecoveryAttempt = useCallback(
    (...args: Parameters<FeatureFailureAnalyticsSession["trackRecoveryAttempt"]>) =>
      getSession().trackRecoveryAttempt(...args),
    [getSession],
  );

  return useMemo(
    () => ({ trackFailure, trackRecovered, trackRecoveryAttempt }),
    [trackFailure, trackRecovered, trackRecoveryAttempt],
  );
}
