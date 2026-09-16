"use client";

import { useEffect } from "react";
import { clearAnalyticsUserId } from "@/lib/analytics/user-id";
import { observeAuthMessages } from "@/lib/auth/auth-session-events";

export function AuthSessionSync() {
  useEffect(
    () =>
      observeAuthMessages((message) => {
        clearAnalyticsUserId();
        // A full document navigation discards the previous account's in-memory UI.
        window.location.replace(message === "LOGIN" ? "/home" : "/login");
      }),
    [],
  );
  return null;
}
