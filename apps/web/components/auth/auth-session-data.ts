"use client";

import { clearAppQueryCacheIfLoaded } from "@/components/providers/query-cache-control";
import { clearRagConversationSnapshot } from "@/components/rag/rag-conversation-storage";
import { clearAnalyticsUserId } from "@/lib/analytics/user-id";

export function clearAuthSessionData(storage?: Pick<Storage, "removeItem"> | null): void {
  clearAppQueryCacheIfLoaded();
  if (storage === null) return;
  clearRagConversationSnapshot(storage);
  clearAnalyticsUserId(storage);
}
