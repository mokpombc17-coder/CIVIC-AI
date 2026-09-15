"use client";

import { useEffect } from "react";

export const ANALYTICS_USER_ID_STORAGE_KEY = "civic.analytics-user-id.v1";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type GoogleTagSet = (command: "set", parameters: { user_id: string }) => void;

export type GoogleAnalyticsUserIdentityTarget = {
  dataLayer?: unknown[];
  gtag?: GoogleTagSet;
  sessionStorage: Pick<Storage, "getItem">;
};

export function GoogleAnalyticsUserIdentity() {
  useEffect(() => {
    applyStoredGoogleAnalyticsUserId(window as GoogleAnalyticsUserIdentityTarget);
  }, []);

  return null;
}

export function applyStoredGoogleAnalyticsUserId(
  target: GoogleAnalyticsUserIdentityTarget,
): boolean {
  let userId: string | null;

  try {
    userId = target.sessionStorage.getItem(ANALYTICS_USER_ID_STORAGE_KEY);
  } catch {
    return false;
  }

  if (!userId || !UUID_PATTERN.test(userId)) {
    return false;
  }

  if (target.gtag) {
    target.gtag("set", { user_id: userId });
    return true;
  }

  const dataLayer = target.dataLayer ?? [];
  target.dataLayer = dataLayer;
  dataLayer.push(createGoogleTagArguments("set", { user_id: userId }));
  return true;
}

function createGoogleTagArguments(command: "set", parameters: { user_id: string }): IArguments {
  // gtag queues the function's arguments object in dataLayer.
  void command;
  void parameters;
  // eslint-disable-next-line prefer-rest-params
  return arguments;
}
