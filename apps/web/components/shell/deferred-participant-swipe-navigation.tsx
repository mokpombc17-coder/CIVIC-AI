"use client";

import { useEffect, useState, type ComponentType } from "react";
import {
  homeHeroAnimationCompleteEvent,
  homeHeroAnimationRootSelector,
} from "@/lib/home-hero-animation";
import { normalizeParticipantLandingRoute } from "@/lib/participant-swipe-navigation";

const swipeRuntimeFallbackMs = 3_000;
const swipeRuntimeIdleTimeoutMs = 400;

type SwipeRuntimeComponent = ComponentType<{ activeRoute: string }>;

type IdleWindow = Window &
  typeof globalThis & {
    cancelIdleCallback?: (handle: number) => void;
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  };

export function DeferredParticipantSwipeNavigation({
  activeRoute,
}: Readonly<{ activeRoute: string }>) {
  const [Runtime, setRuntime] = useState<SwipeRuntimeComponent | null>(null);

  useEffect(() => {
    if (Runtime || !normalizeParticipantLandingRoute(activeRoute)) return;

    let active = true;
    let loadQueued = false;
    let fallbackHandle = 0;
    let cancelScheduledImport: (() => void) | undefined;

    const importRuntime = () => {
      void import("./participant-swipe-navigation-controller").then(
        ({ ParticipantSwipeNavigationController }) => {
          if (active) setRuntime(() => ParticipantSwipeNavigationController);
        },
      );
    };

    const queueRuntimeLoad = () => {
      if (loadQueued) return;
      loadQueued = true;
      window.clearTimeout(fallbackHandle);
      window.removeEventListener(homeHeroAnimationCompleteEvent, queueRuntimeLoad);

      const idleWindow = window as IdleWindow;
      if (typeof idleWindow.requestIdleCallback === "function") {
        const idleHandle = idleWindow.requestIdleCallback(importRuntime, {
          timeout: swipeRuntimeIdleTimeoutMs,
        });
        cancelScheduledImport = () => idleWindow.cancelIdleCallback?.(idleHandle);
        return;
      }

      const timeoutHandle = window.setTimeout(importRuntime, 0);
      cancelScheduledImport = () => window.clearTimeout(timeoutHandle);
    };

    fallbackHandle = window.setTimeout(queueRuntimeLoad, swipeRuntimeFallbackMs);

    if (shouldWaitForHomeHero(activeRoute)) {
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
  }, [Runtime, activeRoute]);

  return Runtime ? <Runtime activeRoute={activeRoute} /> : null;
}

function shouldWaitForHomeHero(activeRoute: string): boolean {
  if (activeRoute !== "/home") return false;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;

  const hero = document.querySelector<HTMLElement>(homeHeroAnimationRootSelector);
  return hero?.dataset.homeHeroAnimationState !== "complete";
}
