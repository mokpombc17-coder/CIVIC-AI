import { headers } from "next/headers";
import {
  homeHeroAnimationBootstrapReadyMark,
  homeHeroAnimationClassName,
  homeHeroAnimationCompleteEvent,
  homeHeroAnimationCompletionName,
  homeHeroAnimationCompletionSelector,
  homeHeroAnimationEndMark,
  homeHeroAnimationFallbackMs,
  homeHeroAnimationRootSelector,
  homeHeroAnimationStartMark,
} from "@/lib/home-hero-animation";

const bootstrapSource = `(() => {
  "use strict";

  const currentScript = document.currentScript;
  const participantSurface = currentScript?.closest('[data-participant-surface="true"]');
  const hero = participantSurface?.querySelector(${JSON.stringify(homeHeroAnimationRootSelector)})
    ?? document.querySelector(${JSON.stringify(homeHeroAnimationRootSelector)});
  if (!(hero instanceof HTMLElement)) return;

  const initialState = hero.dataset.homeHeroAnimationState;
  if (initialState === "pending" || initialState === "running" || initialState === "complete") {
    return;
  }

  const animationTarget = hero.querySelector(${JSON.stringify(
    homeHeroAnimationCompletionSelector,
  )});
  let completed = false;
  let completionFallbackHandle = 0;

  const completeAnimation = () => {
    if (completed) return;
    completed = true;
    window.clearTimeout(completionFallbackHandle);
    animationTarget?.removeEventListener("animationend", handleAnimationEnd);
    hero.dataset.homeHeroAnimationState = "complete";
    performance.mark?.(${JSON.stringify(homeHeroAnimationEndMark)});
    window.dispatchEvent(new Event(${JSON.stringify(homeHeroAnimationCompleteEvent)}));
  };

  function handleAnimationEnd(event) {
    if (event.animationName !== ${JSON.stringify(homeHeroAnimationCompletionName)}) return;
    completeAnimation();
  }

  const startAnimation = () => {
    if (hero.dataset.homeHeroAnimationState !== "pending") return;
    hero.dataset.homeHeroAnimationState = "running";
    performance.mark?.(${JSON.stringify(homeHeroAnimationStartMark)});
    animationTarget?.addEventListener("animationend", handleAnimationEnd);
    hero.classList.add(${JSON.stringify(homeHeroAnimationClassName)});

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      completeAnimation();
      return;
    }

    completionFallbackHandle = window.setTimeout(completeAnimation, ${homeHeroAnimationFallbackMs});
  };

  hero.dataset.homeHeroAnimationState = "pending";
  performance.mark?.(${JSON.stringify(homeHeroAnimationBootstrapReadyMark)});
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(startAnimation);
  });
})();`;

export async function HomeHeroAnimationBootstrap() {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return <script dangerouslySetInnerHTML={{ __html: bootstrapSource }} nonce={nonce} />;
}
