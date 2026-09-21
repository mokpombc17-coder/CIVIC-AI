export const homeHeroAnimationRootSelector = '.civic-opinion-hero[data-home-hero-animate="true"]';
export const homeHeroAnimationClassName = "civic-opinion-hero--animated";
export const homeHeroAnimationReplaySelector = "[data-home-hero-replay]";
export const homeHeroAnimationCompletionSelector = ".civic-hero-label";
export const homeHeroAnimationCompletionName = "civic-hero-content-reveal";
export const homeHeroAnimationCompleteEvent = "civic:home-hero-animation-complete";

export const homeHeroAnimationFallbackMs = 1_500;
export const homeHeroAnimationBootstrapReadyMark = "civic-home-hero-bootstrap-ready";
export const homeHeroAnimationStartMark = "civic-home-hero-animation-start";
export const homeHeroAnimationEndMark = "civic-home-hero-animation-end";
export const homeQueryRuntimeImportMark = "civic-home-query-runtime-import-start";

export function replayHomeHeroAnimation(hero: HTMLElement) {
  hero.classList.remove(homeHeroAnimationClassName);
  void hero.offsetWidth;
  hero.classList.add(homeHeroAnimationClassName);
}
