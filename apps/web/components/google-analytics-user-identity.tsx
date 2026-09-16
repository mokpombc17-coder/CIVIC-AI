"use client";

import { useEffect } from "react";
import {
  applyStoredGoogleAnalyticsUserId,
  type GoogleAnalyticsTarget,
} from "@/lib/analytics/google-analytics";

export {
  ANALYTICS_USER_ID_STORAGE_KEY,
  applyStoredGoogleAnalyticsUserId,
} from "@/lib/analytics/google-analytics";

export type GoogleAnalyticsUserIdentityTarget = GoogleAnalyticsTarget;

export function GoogleAnalyticsUserIdentity() {
  useEffect(() => {
    applyStoredGoogleAnalyticsUserId(window as GoogleAnalyticsUserIdentityTarget);
  }, []);

  return null;
}
