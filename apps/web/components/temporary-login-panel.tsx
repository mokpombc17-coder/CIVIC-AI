"use client";

import { useState } from "react";
import { requestTemporaryLogin, TEMPORARY_LOGIN_SUBJECT } from "@/lib/auth/request-temporary-login";

type TemporaryLoginStatus = "idle" | "loading" | "authenticated" | "error";

export function TemporaryLoginPanel({ initialAuthenticated }: { initialAuthenticated: boolean }) {
  const [status, setStatus] = useState<TemporaryLoginStatus>(
    initialAuthenticated ? "authenticated" : "idle",
  );

  const login = async () => {
    setStatus("loading");

    try {
      await requestTemporaryLogin();
      setStatus("authenticated");
    } catch {
      setStatus("error");
    }
  };

  const authenticated = status === "authenticated";
  const loading = status === "loading";

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Local auth emulator</p>
          <h2>채팅 연동용 임시 로그인</h2>
        </div>
        <span className={`status ${authenticated ? "status-success" : ""}`}>
          {authenticated ? "로그인됨" : "로그인 필요"}
        </span>
      </div>

      <p>
        개발용 사용자 <code>{TEMPORARY_LOGIN_SUBJECT}</code>로 1시간짜리 HttpOnly JWT 쿠키를
        발급합니다.
      </p>

      <button
        className="primary-button"
        disabled={authenticated || loading}
        onClick={() => void login()}
        type="button"
      >
        {authenticated ? "임시 로그인 완료" : loading ? "발급 중..." : "임시 로그인"}
      </button>

      <p aria-live="polite" role={status === "error" ? "alert" : undefined}>
        {status === "error"
          ? "임시 로그인에 실패했습니다. 개발 서버에서 다시 시도해 주세요."
          : authenticated
            ? "브라우저가 HttpOnly 쿠키를 보관하고 이후 채팅 요청에 자동으로 전달합니다."
            : null}
      </p>
    </section>
  );
}
