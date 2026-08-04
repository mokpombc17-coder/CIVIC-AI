"use client";

import { useState } from "react";
import { requestTemporaryLogin } from "@/lib/auth/request-temporary-login";

type TemporaryLoginStatus = "idle" | "loading" | "authenticated" | "error";

export function TemporaryLoginControl() {
  const [status, setStatus] = useState<TemporaryLoginStatus>("idle");

  const login = async () => {
    setStatus("loading");

    try {
      await requestTemporaryLogin();
      setStatus("authenticated");
    } catch {
      setStatus("error");
    }
  };

  return (
    <button
      aria-live="polite"
      className="secondary-button"
      disabled={status === "loading"}
      onClick={() => void login()}
      type="button"
    >
      {temporaryLoginLabel(status)}
    </button>
  );
}

function temporaryLoginLabel(status: TemporaryLoginStatus): string {
  switch (status) {
    case "loading":
      return "임시 로그인 발급 중…";
    case "authenticated":
      return "임시 로그인 다시 갱신";
    case "error":
      return "임시 로그인 실패 · 다시 시도";
    case "idle":
      return "임시 로그인 갱신";
  }
}
