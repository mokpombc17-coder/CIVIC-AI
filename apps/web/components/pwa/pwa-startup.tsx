"use client";

import { useEffect, useState } from "react";
import { isStandalonePwa } from "@/lib/pwa/runtime";
import {
  initializePwaSession,
  PWA_LOGIN_PATH,
  PWA_MAIN_PATH,
  type PwaSessionResult,
  waitForMinimumPwaSplash,
} from "@/lib/pwa/session-bootstrap";

type RetryableFailure = Extract<PwaSessionResult, { status: "retryable-error" }>;

export function PwaStartup() {
  const [attempt, setAttempt] = useState(0);
  const [failure, setFailure] = useState<RetryableFailure | null>(null);

  useEffect(() => {
    const standaloneNavigator = navigator as Navigator & { standalone?: boolean };
    const matchMedia =
      typeof window.matchMedia === "function" ? window.matchMedia.bind(window) : undefined;

    if (!isStandalonePwa(matchMedia, standaloneNavigator.standalone)) {
      window.location.replace(PWA_MAIN_PATH);
      return;
    }

    let active = true;
    void waitForMinimumPwaSplash(initializePwaSession(navigator.onLine)).then((result) => {
      if (!active) return;
      if (result.status === "authenticated") {
        window.location.replace(PWA_MAIN_PATH);
        return;
      }
      if (result.status === "unauthenticated") {
        window.location.replace(PWA_LOGIN_PATH);
        return;
      }
      setFailure(result);
    });

    return () => {
      active = false;
    };
  }, [attempt]);

  useEffect(() => {
    if (!failure) return;
    const retryWhenOnline = () => {
      setFailure(null);
      setAttempt((current) => current + 1);
    };
    window.addEventListener("online", retryWhenOnline);
    return () => window.removeEventListener("online", retryWhenOnline);
  }, [failure]);

  const retry = () => {
    setFailure(null);
    setAttempt((current) => current + 1);
  };

  return (
    <main className="civic-pwa-startup" data-pwa-startup-state={failure ? "retry" : "checking"}>
      <section aria-live="polite" className="civic-pwa-startup-content" role="status">
        <h1 className="civic-pwa-splash-wordmark">CIVIC.AI</h1>
        {failure ? (
          <>
            <p>{failureMessage(failure.reason)}</p>
            <button className="civic-pwa-retry" onClick={retry} type="button">
              다시 시도
            </button>
          </>
        ) : (
          <p>로그인 상태를 확인하고 있습니다.</p>
        )}
      </section>
    </main>
  );
}

function failureMessage(reason: RetryableFailure["reason"]): string {
  if (reason === "offline" || reason === "network") {
    return "인터넷 연결을 확인해 주세요. 연결되면 자동으로 다시 시도합니다.";
  }
  if (reason === "rate-limited") {
    return "요청이 잠시 지연되고 있습니다. 잠시 후 다시 시도해 주세요.";
  }
  return "로그인 서버에 일시적으로 연결할 수 없습니다. 로그인 정보는 유지됩니다.";
}
