"use client";

import { useState, type ReactNode } from "react";
import { downloadFile } from "@/lib/native/download-client";

type AuthenticatedDownloadLinkProps = Readonly<{
  children: ReactNode;
  className?: string;
  href: string;
}>;

export function AuthenticatedDownloadLink({
  children,
  className,
  href,
}: AuthenticatedDownloadLinkProps) {
  const [message, setMessage] = useState("");

  return (
    <>
      <button
        className={className}
        onClick={() => {
          setMessage("");
          void downloadFile({
            url: new URL(href, window.location.origin).toString(),
            requiresAuthentication: true,
          }).catch(() => setMessage("원본 파일을 열지 못했습니다. 다시 로그인해 주세요."));
        }}
        type="button"
      >
        {children}
      </button>
      {message ? (
        <span aria-live="polite" className="sr-only" role="status">
          {message}
        </span>
      ) : null}
    </>
  );
}
