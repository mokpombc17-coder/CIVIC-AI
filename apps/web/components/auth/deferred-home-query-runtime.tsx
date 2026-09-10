"use client";

import { useEffect, useState, type ComponentType } from "react";

const heroCompletionSelector = ".civic-opinion-hero--animated .civic-hero-label";
const heroCompletionAnimationName = "civic-hero-content-reveal";
const homeQueryRuntimeFallbackMs = 1_500;
const homeQueryRuntimeIdleTimeoutMs = 400;

type HomeQueryRuntimeComponent = ComponentType<{ authenticated: boolean }>;

type IdleWindow = Window &
  typeof globalThis & {
    cancelIdleCallback?: (handle: number) => void;
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  };

export function DeferredHomeQueryRuntime({ authenticated }: Readonly<{ authenticated: boolean }>) {
  const [Runtime, setRuntime] = useState<HomeQueryRuntimeComponent | null>(null);

  useEffect(() => {
    let active = true;
    let loadQueued = false;
    let cancelScheduledImport: (() => void) | undefined;
    const animationTarget = document.querySelector<HTMLElement>(heroCompletionSelector);

    const importRuntime = () => {
      void import("./home-query-runtime").then(({ HomeQueryRuntime }) => {
        if (active) setRuntime(() => HomeQueryRuntime);
      });
    };

    const queueRuntimeLoad = () => {
      if (loadQueued) return;
      loadQueued = true;
      window.clearTimeout(fallbackHandle);
      animationTarget?.removeEventListener("animationend", handleAnimationEnd);

      const idleWindow = window as IdleWindow;
      if (typeof idleWindow.requestIdleCallback === "function") {
        const idleHandle = idleWindow.requestIdleCallback(importRuntime, {
          timeout: homeQueryRuntimeIdleTimeoutMs,
        });
        cancelScheduledImport = () => idleWindow.cancelIdleCallback?.(idleHandle);
        return;
      }

      const timeoutHandle = window.setTimeout(importRuntime, 0);
      cancelScheduledImport = () => window.clearTimeout(timeoutHandle);
    };

    function handleAnimationEnd(event: Event) {
      if ((event as AnimationEvent).animationName !== heroCompletionAnimationName) return;
      queueRuntimeLoad();
    }

    const fallbackHandle = window.setTimeout(queueRuntimeLoad, homeQueryRuntimeFallbackMs);

    if (shouldWaitForHeroAnimation(animationTarget)) {
      animationTarget?.addEventListener("animationend", handleAnimationEnd);
    } else {
      queueRuntimeLoad();
    }

    return () => {
      active = false;
      window.clearTimeout(fallbackHandle);
      animationTarget?.removeEventListener("animationend", handleAnimationEnd);
      cancelScheduledImport?.();
    };
  }, []);

  return Runtime ? <Runtime authenticated={authenticated} /> : null;
}

function shouldWaitForHeroAnimation(target: HTMLElement | null): boolean {
  if (!target) return false;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  if (typeof target.getAnimations !== "function") return true;
  return target
    .getAnimations()
    .some((animation) => animation.pending || animation.playState === "running");
}
