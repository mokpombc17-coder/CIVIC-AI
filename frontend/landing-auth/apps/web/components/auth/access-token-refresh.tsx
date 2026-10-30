"use client";

import { useEffect, useState, type ReactNode } from "react";
import { FullscreenStatus } from "@/components/shell/fullscreen-status";
import { refreshSession } from "@/lib/auth/authenticated-fetch";

export function AccessTokenRefresh({
  loadingFallback,
  returnTo,
}: Readonly<{ loadingFallback?: ReactNode; returnTo: string }>) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    // The shared refresh joins another tab's rotation (409) instead of reporting it as a
    // sign-out, and only a refused session goes back to login.
    void refreshSession().then((outcome) => {
      if (!active) return;
      if (outcome === "refreshed") {
        location.replace(returnTo);
      } else if (outcome === "rejected") {
        location.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
      } else {
        setFailed(true);
      }
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
