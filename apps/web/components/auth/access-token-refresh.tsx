"use client";

import { useEffect, useState } from "react";
import { FullscreenStatus } from "@/components/shell/fullscreen-status";
import { refreshAccessToken } from "@/lib/auth/authenticated-fetch";

export function AccessTokenRefresh({ returnTo }: Readonly<{ returnTo: string }>) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void refreshAccessToken().then((result) => {
      if (!active) return;
      if (result === "authenticated") {
        location.replace(returnTo);
        return;
      }
      if (result === "unauthorized") {
        location.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
        return;
      }
      setFailed(true);
    });
    return () => {
      active = false;
    };
  }, [returnTo]);

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
