"use client";

import { useState } from "react";
import { clearRagConversationSnapshot } from "@/components/rag/rag-conversation-session";
import { clearAnalyticsUserId } from "@/lib/analytics/user-id";
import { sendAuthMessage } from "@/lib/auth/auth-session-events";

export function LogoutButton() {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function logout() {
    setBusy(true);
    setFailed(false);
    if (await requestLogout()) {
      window.location.assign("/login");
      return;
    }
    setBusy(false);
    setFailed(true);
  }

  return (
    <div className="civic-auth-action">
      <button disabled={busy} onClick={() => void logout()} type="button">
        {busy ? "로그아웃 중…" : "로그아웃"}
      </button>
      {failed ? <span role="status">로그아웃하지 못했습니다.</span> : null}
    </div>
  );
}

type LogoutStorage = Pick<Storage, "removeItem">;

export async function requestLogout(
  request: typeof fetch = fetch,
  storage: LogoutStorage | null = browserSessionStorage(),
): Promise<boolean> {
  try {
    const response = await request("/api/v1/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    if (!response.ok) return false;
    if (storage) {
      clearRagConversationSnapshot(storage);
      clearAnalyticsUserId(storage);
    }
    sendAuthMessage("LOGOUT");
    return true;
  } catch {
    return false;
  }
}

function browserSessionStorage(): LogoutStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
