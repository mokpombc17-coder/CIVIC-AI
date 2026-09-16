"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { observeAuthMessages } from "@/lib/auth/auth-session-events";
import { clearRagConversationSnapshot } from "./rag-conversation-session";
import { readRagSessionOwner } from "./rag-session-owner";

/** Cached route props are not proof that the browser still belongs to this user. */
export function RagSessionBoundary({
  ownerUserId,
  children,
}: Readonly<{ ownerUserId: string; children: ReactNode }>) {
  const [admitted, setAdmitted] = useState(false);
  const [status, setStatus] = useState<"checking" | "ready" | "unavailable">("checking");
  const content = useRef<HTMLDivElement>(null);
  const retry = useRef<() => void>(() => {});

  useEffect(() => {
    let disposed = false;
    let invalidated = false;
    let generation = 0;
    let pending: AbortController | undefined;

    const hide = () => {
      // Synchronous DOM masking also survives bfcache before React can commit an update.
      if (content.current) content.current.style.display = "none";
      setStatus("checking");
    };
    const suspend = () => {
      generation += 1;
      pending?.abort();
      pending = undefined;
      hide();
    };
    const check = async () => {
      if (disposed || invalidated || pending || document.visibilityState === "hidden") return;
      hide();
      const current = ++generation;
      const controller = new AbortController();
      pending = controller;
      const timeout = window.setTimeout(() => controller.abort(), 10_000);
      const result = await readRagSessionOwner(ownerUserId, controller.signal);
      window.clearTimeout(timeout);
      if (disposed || generation !== current) return;
      pending = undefined;
      if (result === "current") {
        if (content.current) content.current.style.display = "contents";
        setAdmitted(true);
        setStatus("ready");
      } else if (result === "unavailable") {
        setStatus("unavailable");
      } else {
        invalidated = true;
        setAdmitted(false);
        if (result === "changed") clearRagConversationSnapshot();
        // An expired access token uses the existing refresh/login flow.
        const returnTo = window.location.pathname + window.location.search;
        window.location.replace(
          result === "expired" ? `/auth/refresh?returnTo=${encodeURIComponent(returnTo)}` : "/home",
        );
      }
    };
    const visible = () => {
      if (document.visibilityState === "hidden") suspend();
      else void check();
    };
    const focus = () => void check();
    const leaving = () => suspend();
    const restored = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      suspend();
      invalidated = true;
      // Obtain fresh server route props; never reveal the cached RAG document first.
      window.location.reload();
    };
    const unsubscribe = observeAuthMessages(() => {
      invalidated = true;
      suspend();
      setAdmitted(false); // Unmount the conversation and abort its active request/stream.
    });
    retry.current = () => void check();
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("focus", focus);
    window.addEventListener("pagehide", leaving);
    window.addEventListener("pageshow", restored);
    void check();
    return () => {
      disposed = true;
      pending?.abort();
      unsubscribe();
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("focus", focus);
      window.removeEventListener("pagehide", leaving);
      window.removeEventListener("pageshow", restored);
    };
  }, [ownerUserId]);

  return (
    <>
      {status !== "ready" ? (
        <div role="status">
          {status === "unavailable" ? (
            <>
              <p>로그인 상태를 확인하지 못했습니다. 다시 시도해 주세요.</p>
              <button onClick={() => retry.current()} type="button">
                다시 확인
              </button>
            </>
          ) : (
            <p>로그인 상태를 확인하고 있습니다.</p>
          )}
        </div>
      ) : null}
      <div
        data-rag-session-content
        style={{ display: status === "ready" ? "contents" : "none" }}
        ref={content}
      >
        {admitted ? children : null}
      </div>
    </>
  );
}
