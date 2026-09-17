"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { clearRagConversationSnapshot } from "@/components/rag/rag-conversation-session";
import { clearAnalyticsUserId } from "@/lib/analytics/user-id";
import { observeAuthMessages } from "@/lib/auth/auth-session-events";

export function AuthSessionSync() {
  const router = useRouter();

  useEffect(
    () =>
      observeAuthMessages((message) => {
        clearRagConversationSnapshot();
        clearAnalyticsUserId();
        router.push((message === "LOGIN" ? "/home" : "/login") as Route);
      }),
    [router],
  );
  return null;
}
