"use client";

import { useEffect, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import {
  AUTHENTICATION_BROADCAST_CHANNEL_NAME,
  createAuthenticationLifecycleHandlers,
} from "@/lib/auth/authentication-lifecycle";
import { getChatQueryClient } from "@/lib/chat/chat-query-client";
import { clearAllPendingTaskSubmissions } from "@/lib/vote/vote-idempotent-submission";
import { getVoteQueryClient } from "@/lib/vote/vote-query-client";

export function AuthenticationLifecycleBoundary({ children }: { children: ReactNode }) {
  const [routeBlocked, setRouteBlocked] = useState(false);

  useEffect(() => {
    let documentNavigationRequested = false;

    function clearVotePendingSubmissions() {
      try {
        clearAllPendingTaskSubmissions(window.sessionStorage);
      } catch {
        // A hard reload still resets in-memory state when browser storage is unavailable.
      }
    }

    function hardReload() {
      if (documentNavigationRequested) return;
      documentNavigationRequested = true;
      clearVotePendingSubmissions();
      window.location.reload();
    }

    const { handleMessage, handlePageShow } = createAuthenticationLifecycleHandlers({
      onBfcacheRestore: hardReload,
      onLogin: hardReload,
      onLogout: () => {
        if (documentNavigationRequested) return;
        documentNavigationRequested = true;
        flushSync(() => setRouteBlocked(true));
        getChatQueryClient().clear();
        getVoteQueryClient().clear();
        clearVotePendingSubmissions();
        window.location.replace("/login");
      },
    });
    let channel: BroadcastChannel | null = null;

    try {
      if (typeof window.BroadcastChannel === "function") {
        channel = new window.BroadcastChannel(AUTHENTICATION_BROADCAST_CHANNEL_NAME);
        channel.addEventListener("message", handleMessage);
      }
    } catch {
      channel = null;
    }

    window.addEventListener("pageshow", handlePageShow);

    return () => {
      window.removeEventListener("pageshow", handlePageShow);
      channel?.removeEventListener("message", handleMessage);
      channel?.close();
    };
  }, []);

  if (routeBlocked) return null;

  return children;
}
