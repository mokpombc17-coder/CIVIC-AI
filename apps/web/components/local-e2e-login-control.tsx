"use client";

import { useState } from "react";
import { notifyAuthenticationSucceeded } from "@/lib/auth/authentication-session-events";
import { requestLocalE2ELogin } from "@/lib/auth/request-local-e2e-login";

type LocalE2ELoginStatus = "idle" | "loading" | "authenticated" | "error";

export function LocalE2ELoginControl() {
  const [status, setStatus] = useState<LocalE2ELoginStatus>("idle");

  const login = async () => {
    setStatus("loading");

    try {
      await requestLocalE2ELogin();
      notifyAuthenticationSucceeded(window);
      setStatus("authenticated");
    } catch {
      setStatus("error");
    }
  };

  return (
    <button
      aria-live="polite"
      className="secondary-button"
      disabled={status === "loading"}
      onClick={() => void login()}
      type="button"
    >
      {localE2ELoginLabel(status)}
    </button>
  );
}

function localE2ELoginLabel(status: LocalE2ELoginStatus): string {
  switch (status) {
    case "loading":
      return "로컬 E2E 로그인 발급 중…";
    case "authenticated":
      return "로컬 E2E 로그인 다시 갱신";
    case "error":
      return "로컬 E2E 로그인 실패 · 다시 시도";
    case "idle":
      return "로컬 E2E 로그인 갱신";
  }
}
