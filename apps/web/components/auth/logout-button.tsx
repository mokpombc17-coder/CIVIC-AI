"use client";

import { useState } from "react";

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
    <div className="civic-session-action">
      <button disabled={busy} onClick={() => void logout()} type="button">
        {busy ? "로그아웃 중…" : "로그아웃"}
      </button>
      {failed ? <span role="status">로그아웃하지 못했습니다.</span> : null}
    </div>
  );
}

export async function requestLogout(request: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await request("/api/v1/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    return response.ok;
  } catch {
    return false;
  }
}
