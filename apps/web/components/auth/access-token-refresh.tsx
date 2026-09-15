"use client";

import { useEffect, useState, type ReactNode } from "react";
import { FullscreenStatus } from "@/components/shell/fullscreen-status";
import { clearAnalyticsUserId } from "@/lib/analytics/user-id";

export function AccessTokenRefresh({
  loadingFallback,
  returnTo,
}: Readonly<{ loadingFallback?: ReactNode; returnTo: string }>) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/v1/auth/refresh", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: "{}",
    })
      .then((response) => {
        if (!active) return;
        if (response.ok) {
          location.replace(returnTo);
          return;
        }
        if (response.status === 401 || response.status === 403) clearAnalyticsUserId();
        location.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [returnTo]);

  if (!failed && loadingFallback !== undefined) return loadingFallback;

  return (
    <FullscreenStatus
      action={
        failed ? <a href={`/login?returnTo=${encodeURIComponent(returnTo)}`}>로그인</a> : undefined
      }
      busy={!failed}
      description={
        failed
          ? "잠시 후 다시 시도하거나 로그인 화면으로 이동해 주세요."
          : "완료되면 요청한 화면으로 자동 이동합니다."
      }
      title={failed ? "인증 서버에 연결하지 못했습니다." : "로그인 상태를 확인하고 있습니다."}
    />
  );
}
