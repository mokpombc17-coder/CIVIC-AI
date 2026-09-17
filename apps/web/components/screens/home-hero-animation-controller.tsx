"use client";

import { useEffect } from "react";
import {
  homeHeroAnimationClassName,
  homeHeroAnimationCompleteEvent,
  homeHeroAnimationCompletionName,
  homeHeroAnimationCompletionSelector,
  homeHeroAnimationEndMark,
  homeHeroAnimationReplaySelector,
  homeHeroAnimationRootSelector,
  homeHeroAnimationStartMark,
  replayHomeHeroAnimation,
} from "@/lib/home-hero-animation";

const heroAnimationFallbackMs = 1_500;
const heroAnimationIdleTimeoutMs = 500;

type IdleWindow = Window &
  typeof globalThis & {
    cancelIdleCallback?: (handle: number) => void;
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  };

export function HomeHeroAnimationController() {
  useEffect(() => {
    const hero = document.querySelector<HTMLElement>(homeHeroAnimationRootSelector);
    if (!hero) return;

    let active = true;
    let completed = false;
    let started = false;
    let firstFrameHandle = 0;
    let secondFrameHandle = 0;
    let completionFallbackHandle = 0;
    let cancelIdleStart: (() => void) | undefined;
    const animationTarget = hero.querySelector<HTMLElement>(homeHeroAnimationCompletionSelector);
    const replayTarget = hero.querySelector<SVGElement>(homeHeroAnimationReplaySelector);

    const completeAnimation = () => {
      if (!active || completed) return;
      completed = true;
      window.clearTimeout(completionFallbackHandle);
      animationTarget?.removeEventListener("animationend", handleAnimationEnd);
      hero.dataset.homeHeroAnimationState = "complete";
      performance.mark?.(homeHeroAnimationEndMark);
      window.dispatchEvent(new Event(homeHeroAnimationCompleteEvent));
    };

    function handleAnimationEnd(event: Event) {
      if ((event as AnimationEvent).animationName !== homeHeroAnimationCompletionName) return;
      completeAnimation();
    }

    const startAnimation = () => {
      if (!active) return;
      started = true;
      hero.dataset.homeHeroAnimationState = "running";
      performance.mark?.(homeHeroAnimationStartMark);
      animationTarget?.addEventListener("animationend", handleAnimationEnd);
      hero.classList.add(homeHeroAnimationClassName);

      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        completeAnimation();
        return;
      }

      completionFallbackHandle = window.setTimeout(completeAnimation, heroAnimationFallbackMs);
    };

    const replayAnimation = () => {
      if (!active || !started) return;
      replayHomeHeroAnimation(hero);
    };

    hero.dataset.homeHeroAnimationState = "pending";
    replayTarget?.addEventListener("click", replayAnimation);
    firstFrameHandle = window.requestAnimationFrame(() => {
      secondFrameHandle = window.requestAnimationFrame(() => {
        const idleWindow = window as IdleWindow;
        if (typeof idleWindow.requestIdleCallback === "function") {
          const idleHandle = idleWindow.requestIdleCallback(startAnimation, {
            timeout: heroAnimationIdleTimeoutMs,
          });
          cancelIdleStart = () => idleWindow.cancelIdleCallback?.(idleHandle);
          return;
        }

        const timeoutHandle = window.setTimeout(startAnimation, 0);
        cancelIdleStart = () => window.clearTimeout(timeoutHandle);
      });
    });

    return () => {
      active = false;
      window.cancelAnimationFrame(firstFrameHandle);
      window.cancelAnimationFrame(secondFrameHandle);
      window.clearTimeout(completionFallbackHandle);
      cancelIdleStart?.();
      animationTarget?.removeEventListener("animationend", handleAnimationEnd);
      replayTarget?.removeEventListener("click", replayAnimation);
    };
  }, []);

  return null;
}
