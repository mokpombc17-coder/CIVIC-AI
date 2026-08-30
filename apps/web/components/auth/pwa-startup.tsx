"use client";

import { useEffect, useState } from "react";
import { FullscreenStatus } from "@/components/shell/fullscreen-status";
import { refreshAccessToken, type AccessTokenRefreshResult } from "@/lib/auth/authenticated-fetch";
import { isInstalledPwa } from "@/lib/auth/pwa-auth";

const PWA_HOME = "/home";
const PWA_LOGIN = "/login?returnTo=%2Fhome";

export function PwaStartup() {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    if (!isInstalledPwa()) {
      location.replace(PWA_HOME);
      return () => {
        active = false;
      };
    }

    void refreshAccessToken().then((result) => {
      if (!active) return;
      const destination = pwaRefreshDestination(result);
      if (destination) {
        location.replace(destination);
        return;
      }
      setFailed(true);
    });
    return () => {
      active = false;
    };
  }, [attempt]);

  return (
    <FullscreenStatus
      action={
        failed ? (
          <>
            <button
              onClick={() => {
                setFailed(false);
                setAttempt((current) => current + 1);
              }}
              type="button"
            >
              다시 시도
            </button>
            <a href={PWA_LOGIN}>로그인</a>
          </>
        ) : undefined
      }
      busy={!failed}
      description={
        failed
          ? "네트워크 연결을 확인한 뒤 다시 시도해 주세요."
          : "저장된 PWA 로그인 세션을 안전하게 확인합니다."
      }
      title={failed ? "자동 로그인에 연결하지 못했습니다." : "자동 로그인 중입니다."}
    />
  );
}

export function pwaRefreshDestination(result: AccessTokenRefreshResult): string | null {
  if (result === "authenticated") return PWA_HOME;
  if (result === "unauthorized") return PWA_LOGIN;
  return null;
}
