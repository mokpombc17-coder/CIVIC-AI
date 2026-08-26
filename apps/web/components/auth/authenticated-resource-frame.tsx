"use client";

import { useEffect, useState } from "react";
import { ensureAccessToken } from "@/lib/auth/authenticated-fetch";

type AuthenticatedResourceFrameProps = Readonly<{
  className?: string;
  src: string;
  title: string;
}>;

export function AuthenticatedResourceFrame({
  className,
  src,
  title,
}: AuthenticatedResourceFrameProps) {
  const [authorization, setAuthorization] = useState<{
    source: string;
    state: "checking" | "ready" | "unavailable";
  }>({ source: src, state: "checking" });
  const state = authorization.source === src ? authorization.state : "checking";

  useEffect(() => {
    let active = true;
    void ensureAccessToken().then((available) => {
      if (active) {
        setAuthorization({ source: src, state: available ? "ready" : "unavailable" });
      }
    });
    return () => {
      active = false;
    };
  }, [src]);

  if (state === "ready") {
    return <iframe className={className} src={src} title={title} />;
  }

  return (
    <div aria-label={title} aria-live="polite" className={className} role="status">
      {state === "checking"
        ? "문서 접근 권한을 확인하고 있습니다."
        : "로그인 상태를 확인하지 못했습니다. 다시 로그인해 주세요."}
    </div>
  );
}
