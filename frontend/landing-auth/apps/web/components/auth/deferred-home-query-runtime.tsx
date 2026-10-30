"use client";

import { useEffect, useState, type ComponentType } from "react";
import {
  homeHeroAnimationCompleteEvent,
  homeHeroAnimationRootSelector,
  homeQueryRuntimeImportMark,
} from "@/lib/home-hero-animation";

const homeQueryRuntimeFallbackMs = 3_000;
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
    const hero = document.querySelector<HTMLElement>(homeHeroAnimationRootSelector);

    const importRuntime = () => {
      performance.mark?.(homeQueryRuntimeImportMark);
      void import("./home-query-runtime").then(({ HomeQueryRuntime }) => {
        if (active) setRuntime(() => HomeQueryRuntime);
      });
    };

    const queueRuntimeLoad = () => {
      if (loadQueued) return;
      loadQueued = true;
      window.clearTimeout(fallbackHandle);
      window.removeEventListener(homeHeroAnimationCompleteEvent, queueRuntimeLoad);

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

    const fallbackHandle = window.setTimeout(queueRuntimeLoad, homeQueryRuntimeFallbackMs);

    if (shouldWaitForHeroAnimation(hero)) {
      window.addEventListener(homeHeroAnimationCompleteEvent, queueRuntimeLoad);
    } else {
      queueRuntimeLoad();
    }

    return () => {
      active = false;
      window.clearTimeout(fallbackHandle);
      window.removeEventListener(homeHeroAnimationCompleteEvent, queueRuntimeLoad);
      cancelScheduledImport?.();
    };
  }, []);

  return Runtime ? <Runtime authenticated={authenticated} /> : null;
}

function shouldWaitForHeroAnimation(hero: HTMLElement | null): boolean {
  if (!hero) return false;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  return hero.dataset.homeHeroAnimationState !== "complete";
}
