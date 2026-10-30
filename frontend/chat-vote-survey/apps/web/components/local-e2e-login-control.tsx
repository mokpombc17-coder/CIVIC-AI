"use client";

import { useState } from "react";
import { notifyAuthenticationSucceeded } from "@/lib/auth/authentication-session-events";
import { requestLocalE2ELogin } from "@/lib/auth/request-local-e2e-login";
import styles from "./local-e2e-login-control.module.css";

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
    <>
      <button
        aria-label="로컬 E2E 로그인 갱신"
        className={styles.control}
        disabled={status === "loading"}
        onClick={() => void login()}
        type="button"
      >
        로그인
      </button>
      <span aria-live="polite" className="sr-only">
        {localE2ELoginStatusMessage(status)}
      </span>
    </>
  );
}

export function localE2ELoginStatusMessage(status: LocalE2ELoginStatus): string {
  switch (status) {
    case "loading":
      return "로컬 E2E 로그인 발급 중…";
    case "authenticated":
      return "로컬 E2E 로그인을 갱신했습니다.";
    case "error":
      return "로컬 E2E 로그인 갱신에 실패했습니다. 다시 시도해 주세요.";
    case "idle":
      return "";
  }
}
