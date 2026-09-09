"use client";

import { useEffect, useState } from "react";

export const RAG_INTRO_DISMISSED_SESSION_KEY = "civic.rag.intro.dismissed";

type RagIntroStorage = Pick<Storage, "getItem" | "setItem">;

export function isRagIntroBannerDismissed(storage: RagIntroStorage): boolean {
  try {
    return storage.getItem(RAG_INTRO_DISMISSED_SESSION_KEY) === "true";
  } catch {
    return false;
  }
}

export function dismissRagIntroBanner(storage: RagIntroStorage): void {
  try {
    storage.setItem(RAG_INTRO_DISMISSED_SESSION_KEY, "true");
  } catch {
    // 저장소 접근이 제한된 환경에서도 현재 화면에서는 닫을 수 있어야 한다.
  }
}

function browserSessionStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function RagIntroBanner({ dismissible = true }: Readonly<{ dismissible?: boolean }>) {
  const [visible, setVisible] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const storage = browserSessionStorage();
      setVisible(!storage || !isRagIntroBannerDismissed(storage));
    });
    return () => {
      active = false;
    };
  }, []);

  if (visible !== true) return null;

  const closeIcon = (
    <svg aria-hidden="true" fill="none" viewBox="0 0 20 20">
      <path
        d="m5 5 10 10M15 5 5 15"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );

  return (
    <header className="civic-rag-session-bar">
      <div className="civic-rag-intro-banner">
        <p className="civic-rag-intro">
          <strong className="civic-rag-intro-title">궁금한 내용을 AI에게 질문해 보세요.</strong>
          <br />
          등록된 자료를 바탕으로 근거와 함께 답변해 드려요.
        </p>
        {dismissible ? (
          <button
            aria-label="안내 닫기"
            className="civic-rag-intro-dismiss"
            onClick={() => {
              const storage = browserSessionStorage();
              if (storage) dismissRagIntroBanner(storage);
              setVisible(false);
            }}
            title="안내 닫기"
            type="button"
          >
            {closeIcon}
          </button>
        ) : (
          <span aria-hidden="true" className="civic-rag-intro-dismiss">
            {closeIcon}
          </span>
        )}
      </div>
    </header>
  );
}
