"use client";

import { useEffect, useState } from "react";

export function AccessTokenRefresh({ returnTo }: Readonly<{ returnTo: string }>) {
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
        location.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [returnTo]);

  return (
    <div className="page-stack">
      <section aria-live="polite" className="hero" role="status">
        <h2>{failed ? "인증 서버에 연결하지 못했습니다." : "로그인 상태를 갱신하고 있습니다."}</h2>
        <p>
          {failed
            ? "잠시 후 다시 시도하거나 로그인 화면으로 이동해 주세요."
            : "완료되면 요청한 화면으로 자동 이동합니다."}
        </p>
        {failed ? <a href={`/login?returnTo=${encodeURIComponent(returnTo)}`}>로그인</a> : null}
      </section>
    </div>
  );
}
