"use client";

import { clearAppQueryCache } from "@/components/providers/app-query-provider";
import { clearRagConversationSnapshot } from "@/components/rag/rag-conversation-session";
import { clearAnalyticsUserId } from "@/lib/analytics/user-id";

export function clearAuthSessionData(storage?: Pick<Storage, "removeItem"> | null): void {
  clearAppQueryCache();
  if (storage === null) return;
  clearRagConversationSnapshot(storage);
  clearAnalyticsUserId(storage);
}
