import { describe, expect, it } from "vitest";
import {
  homeHeroAnimationClassName,
  homeHeroTopicRotationMs,
  homeHeroTopicTransitionMs,
  replayHomeHeroAnimation,
} from "./home-hero-animation";

describe("home hero animation replay", () => {
  it("keeps each opinion topic visible for thirty seconds and crossfades briefly", () => {
    expect(homeHeroTopicRotationMs).toBe(30_000);
    expect(homeHeroTopicTransitionMs).toBe(240);
  });

  it("restarts the CSS animation after forcing the removed class to render", () => {
    const operations: string[] = [];
    const hero = {
      classList: {
        remove: (className: string) => operations.push(`remove:${className}`),
        add: (className: string) => operations.push(`add:${className}`),
      },
      get offsetWidth() {
        operations.push("measure");
        return 360;
      },
    } as unknown as HTMLElement;

    replayHomeHeroAnimation(hero);

    expect(operations).toEqual([
      `remove:${homeHeroAnimationClassName}`,
      "measure",
      `add:${homeHeroAnimationClassName}`,
    ]);
  });
});
