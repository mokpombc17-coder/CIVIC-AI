"use client";

import { useEffect, useState, type ReactNode } from "react";
import { observeAuthMessages } from "@/lib/auth/auth-session-events";
import { clearRagConversationSnapshot } from "./rag-conversation-session";
import { readRagSessionOwner } from "./rag-session-owner";

const sessionOwnerRetryDelayMs = 3_000;

/** Cached route props are not proof that the browser still belongs to this user. */
export function RagSessionBoundary({
  ownerUserId,
  children,
}: Readonly<{ ownerUserId: string; children: ReactNode }>) {
  const [admitted, setAdmitted] = useState(false);

  useEffect(() => {
    let disposed = false;
    let invalidated = false;
    let generation = 0;
    let pending: AbortController | undefined;
    let retryTimer: number | undefined;

    const hide = () => {
      setAdmitted(false);
    };
    const clearRetry = () => {
      if (retryTimer === undefined) return;
      window.clearTimeout(retryTimer);
      retryTimer = undefined;
    };
    const suspend = () => {
      generation += 1;
      pending?.abort();
      pending = undefined;
      clearRetry();
      hide();
    };
    const check = async () => {
      if (disposed || invalidated || pending || document.visibilityState === "hidden") return;
      clearRetry();
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
        setAdmitted(true);
      } else if (result === "unavailable") {
        retryTimer = window.setTimeout(() => {
          retryTimer = undefined;
          void check();
        }, sessionOwnerRetryDelayMs);
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
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("focus", focus);
    window.addEventListener("pagehide", leaving);
    window.addEventListener("pageshow", restored);
    void check();
    return () => {
      disposed = true;
      pending?.abort();
      clearRetry();
      unsubscribe();
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("focus", focus);
      window.removeEventListener("pagehide", leaving);
      window.removeEventListener("pageshow", restored);
    };
  }, [ownerUserId]);

  return admitted ? children : null;
}
