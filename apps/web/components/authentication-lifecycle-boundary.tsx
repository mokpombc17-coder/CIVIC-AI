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
  const [loggedOut, setLoggedOut] = useState(false);

  useEffect(() => {
    let reloadRequested = false;

    function clearVotePendingSubmissions() {
      try {
        clearAllPendingTaskSubmissions(window.sessionStorage);
      } catch {
        // A hard reload still resets in-memory state when browser storage is unavailable.
      }
    }

    function hardReload() {
      if (reloadRequested) return;
      reloadRequested = true;
      clearVotePendingSubmissions();
      window.location.reload();
    }

    const { handleMessage, handlePageShow } = createAuthenticationLifecycleHandlers({
      onBfcacheRestore: hardReload,
      onLogin: hardReload,
      onLogout: () => {
        flushSync(() => setLoggedOut(true));
        getChatQueryClient().clear();
        getVoteQueryClient().clear();
        clearVotePendingSubmissions();
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

  if (loggedOut) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-[393px] items-center justify-center bg-white px-6 text-center">
        <section role="status">
          <h1 className="text-xl font-bold text-slate-950">로그아웃되었습니다</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            다시 로그인하면 현재 화면을 새로 불러옵니다.
          </p>
          <a
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white"
            href="/login"
          >
            로그인하기
          </a>
        </section>
      </main>
    );
  }

  return children;
}
