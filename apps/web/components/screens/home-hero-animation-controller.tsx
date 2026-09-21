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
import { participantSwipeReadyEvent } from "@/lib/participant-swipe-navigation";

const heroAnimationFallbackMs = 1_500;
const heroAnimationIdleTimeoutMs = 500;
const swipeReadyFallbackMs = 500;

type IdleWindow = Window &
  typeof globalThis & {
    cancelIdleCallback?: (handle: number) => void;
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  };

export function HomeHeroAnimationController() {
  useEffect(() => {
    performance.mark?.("civic-home-hero-controller-effect");

    const hero = document.querySelector<HTMLElement>(homeHeroAnimationRootSelector);
    if (!hero) return;

    let active = true;
    let completed = false;
    let started = false;
    let firstFrameHandle = 0;
    let secondFrameHandle = 0;
    let completionFallbackHandle = 0;
    let swipeReadyFallbackHandle = 0;
    let animationStartQueued = false;
    let cancelIdleStart: (() => void) | undefined;
    const participantSurface = hero.closest<HTMLElement>('[data-participant-surface="true"]');
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

    const queueAnimationStart = () => {
      if (!active || animationStartQueued) return;
      animationStartQueued = true;
      window.clearTimeout(swipeReadyFallbackHandle);
      window.removeEventListener(participantSwipeReadyEvent, queueAnimationStart);

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
    };

    hero.dataset.homeHeroAnimationState = "pending";
    replayTarget?.addEventListener("click", replayAnimation);
    window.addEventListener(participantSwipeReadyEvent, queueAnimationStart);
    if (!participantSurface || participantSurface.dataset.participantSwipeReady === "true") {
      queueAnimationStart();
    } else {
      swipeReadyFallbackHandle = window.setTimeout(queueAnimationStart, swipeReadyFallbackMs);
    }

    return () => {
      active = false;
      window.cancelAnimationFrame(firstFrameHandle);
      window.cancelAnimationFrame(secondFrameHandle);
      window.clearTimeout(completionFallbackHandle);
      window.clearTimeout(swipeReadyFallbackHandle);
      cancelIdleStart?.();
      window.removeEventListener(participantSwipeReadyEvent, queueAnimationStart);
      animationTarget?.removeEventListener("animationend", handleAnimationEnd);
      replayTarget?.removeEventListener("click", replayAnimation);
    };
  }, []);

  return null;
}
