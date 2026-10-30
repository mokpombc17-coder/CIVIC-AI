"use client";

import { useEffect } from "react";
import { PlatformPageShell } from "@/components/platform-page-shell";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PlatformPageShell title="오류">
      <div className="platform-state-page">
        <section className="platform-state-card" role="alert">
          <p className="platform-state-code">ERROR</p>
          <h2>화면을 불러오지 못했습니다.</h2>
          <button className="platform-state-button" onClick={reset} type="button">
            다시 시도
          </button>
        </section>
      </div>
    </PlatformPageShell>
  );
}
