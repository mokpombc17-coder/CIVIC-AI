"use client";

import { useEffect } from "react";
import {
  homeHeroAnimationClassName,
  homeHeroAnimationCompleteEvent,
  homeHeroAnimationCompletionName,
  homeHeroAnimationCompletionSelector,
  homeHeroAnimationEndMark,
  homeHeroAnimationFallbackMs,
  homeHeroAnimationReplaySelector,
  homeHeroAnimationRootSelector,
  homeHeroAnimationStartMark,
  replayHomeHeroAnimation,
} from "@/lib/home-hero-animation";

export function HomeHeroAnimationController() {
  useEffect(() => {
    performance.mark?.("civic-home-hero-controller-effect");

    const hero = document.querySelector<HTMLElement>(homeHeroAnimationRootSelector);
    if (!hero) return;

    let active = true;
    let completed = false;
    let ownsInitialAnimation = false;
    let firstFrameHandle = 0;
    let secondFrameHandle = 0;
    let completionFallbackHandle = 0;
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
      if (!active || hero.dataset.homeHeroAnimationState !== "pending") return;
      hero.dataset.homeHeroAnimationState = "running";
      performance.mark?.(homeHeroAnimationStartMark);
      animationTarget?.addEventListener("animationend", handleAnimationEnd);
      hero.classList.add(homeHeroAnimationClassName);

      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        completeAnimation();
        return;
      }

      completionFallbackHandle = window.setTimeout(completeAnimation, homeHeroAnimationFallbackMs);
    };

    const replayAnimation = () => {
      if (!active || hero.dataset.homeHeroAnimationState === "pending") return;
      replayHomeHeroAnimation(hero);
    };

    const queueAnimationStart = () => {
      firstFrameHandle = window.requestAnimationFrame(() => {
        secondFrameHandle = window.requestAnimationFrame(startAnimation);
      });
    };

    replayTarget?.addEventListener("click", replayAnimation);

    const initialState = hero.dataset.homeHeroAnimationState;
    const bootstrapOwnsInitialAnimation =
      initialState === "pending" || initialState === "running" || initialState === "complete";
    if (!bootstrapOwnsInitialAnimation) {
      ownsInitialAnimation = true;
      hero.dataset.homeHeroAnimationState = "pending";
      queueAnimationStart();
    }

    return () => {
      active = false;
      window.cancelAnimationFrame(firstFrameHandle);
      window.cancelAnimationFrame(secondFrameHandle);
      window.clearTimeout(completionFallbackHandle);
      animationTarget?.removeEventListener("animationend", handleAnimationEnd);
      replayTarget?.removeEventListener("click", replayAnimation);
      if (ownsInitialAnimation && !completed) {
        hero.classList.remove(homeHeroAnimationClassName);
        delete hero.dataset.homeHeroAnimationState;
      }
    };
  }, []);

  return null;
}
