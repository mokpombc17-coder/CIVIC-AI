"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { clearAppQueryCache } from "@/components/providers/app-query-provider";
import { clearRagConversationSnapshot } from "@/components/rag/rag-conversation-session";
import { clearAnalyticsUserId } from "@/lib/analytics/user-id";
import { observeAuthMessages } from "@/lib/auth/auth-session-events";

export function AuthSessionSync() {
  const router = useRouter();

  useEffect(
    () =>
      observeAuthMessages((message) => {
        if (message === "LOGOUT") clearAppQueryCache();
        clearRagConversationSnapshot();
        clearAnalyticsUserId();
        router.push((message === "LOGIN" ? "/home" : "/login") as Route);
      }),
    [router],
  );
  return null;
}
