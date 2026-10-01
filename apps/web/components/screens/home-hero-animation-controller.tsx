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
  homeHeroTopicRotationMs,
  homeHeroTopicSelector,
  homeHeroTopicTransitionMs,
  homeHeroTopicsRootSelector,
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
    let topicRotationHandle = 0;
    let topicTransitionFrameHandle = 0;
    let topicTransitionCleanupHandle = 0;
    const animationTarget = hero.querySelector<HTMLElement>(homeHeroAnimationCompletionSelector);
    const topicRoot = document.querySelector<HTMLElement>(homeHeroTopicsRootSelector);
    const topicPanels = topicRoot
      ? Array.from(topicRoot.querySelectorAll<HTMLElement>(homeHeroTopicSelector))
      : [];
    const replayTargets = topicRoot
      ? Array.from(topicRoot.querySelectorAll<SVGElement>(homeHeroAnimationReplaySelector))
      : Array.from(hero.querySelectorAll<SVGElement>(homeHeroAnimationReplaySelector));
    let activeTopicIndex = Math.max(
      0,
      topicPanels.findIndex((topic) => !topic.hidden),
    );

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

    const forceFallback = () => {
      if (!active || completed) return;
      hero.classList.remove(homeHeroAnimationClassName);
      hero.dataset.homeHeroAnimationFallback = "true";
      completeAnimation();
    };

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

      completionFallbackHandle = window.setTimeout(forceFallback, homeHeroAnimationFallbackMs);
    };

    const replayAnimation = (event: Event) => {
      const targetHero = (event.currentTarget as Element).closest<HTMLElement>(
        homeHeroAnimationRootSelector,
      );
      if (!active || !targetHero || targetHero.dataset.homeHeroAnimationState === "pending") return;
      replayHomeHeroAnimation(targetHero);
    };

    const rotateTopic = () => {
      if (!active || topicPanels.length < 2) return;

      const nextTopicIndex = (activeTopicIndex + 1) % topicPanels.length;
      const currentTopic = topicPanels[activeTopicIndex];
      const nextTopic = topicPanels[nextTopicIndex];
      if (!currentTopic || !nextTopic) return;

      nextTopic.hidden = false;
      nextTopic.dataset.homeHeroTopicActive = "false";
      nextTopic.setAttribute("aria-hidden", "true");
      nextTopic.inert = true;
      void nextTopic.offsetWidth;

      topicTransitionFrameHandle = window.requestAnimationFrame(() => {
        if (!active) return;

        currentTopic.dataset.homeHeroTopicActive = "false";
        currentTopic.setAttribute("aria-hidden", "true");
        currentTopic.inert = true;
        nextTopic.dataset.homeHeroTopicActive = "true";
        nextTopic.setAttribute("aria-hidden", "false");
        nextTopic.inert = false;

        const nextHero = nextTopic.querySelector<HTMLElement>(homeHeroAnimationRootSelector);
        if (nextHero) {
          const useFallback = Array.from(
            topicRoot?.querySelectorAll<HTMLElement>(homeHeroAnimationRootSelector) ?? [],
          ).some((candidate) => candidate.dataset.homeHeroAnimationFallback === "true");

          if (useFallback) {
            nextHero.classList.remove(homeHeroAnimationClassName);
            nextHero.dataset.homeHeroAnimationFallback = "true";
          } else {
            delete nextHero.dataset.homeHeroAnimationFallback;
            replayHomeHeroAnimation(nextHero);
          }
        }

        activeTopicIndex = nextTopicIndex;
        topicTransitionCleanupHandle = window.setTimeout(() => {
          if (!active) return;
          currentTopic.hidden = true;
        }, homeHeroTopicTransitionMs);
        topicRotationHandle = window.setTimeout(rotateTopic, homeHeroTopicRotationMs);
      });
    };

    const queueAnimationStart = () => {
      firstFrameHandle = window.requestAnimationFrame(() => {
        secondFrameHandle = window.requestAnimationFrame(startAnimation);
      });
    };

    replayTargets.forEach((replayTarget) => {
      replayTarget.addEventListener("click", replayAnimation);
    });

    const initialState = hero.dataset.homeHeroAnimationState;
    const bootstrapOwnsInitialAnimation =
      initialState === "pending" || initialState === "running" || initialState === "complete";
    if (!bootstrapOwnsInitialAnimation) {
      ownsInitialAnimation = true;
      hero.dataset.homeHeroAnimationState = "pending";
      queueAnimationStart();
    }

    if (topicPanels.length > 1) {
      topicRotationHandle = window.setTimeout(rotateTopic, homeHeroTopicRotationMs);
    }

    return () => {
      active = false;
      window.cancelAnimationFrame(firstFrameHandle);
      window.cancelAnimationFrame(secondFrameHandle);
      window.clearTimeout(completionFallbackHandle);
      window.clearTimeout(topicRotationHandle);
      window.cancelAnimationFrame(topicTransitionFrameHandle);
      window.clearTimeout(topicTransitionCleanupHandle);
      animationTarget?.removeEventListener("animationend", handleAnimationEnd);
      replayTargets.forEach((replayTarget) => {
        replayTarget.removeEventListener("click", replayAnimation);
      });
      if (ownsInitialAnimation && !completed) {
        hero.classList.remove(homeHeroAnimationClassName);
        delete hero.dataset.homeHeroAnimationState;
      }
    };
  }, []);

  return null;
}
