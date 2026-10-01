import { describe, expect, it } from "vitest";
import { resolveCalloutAttachmentAngle } from "@/components/screens/opinion-gathering-hero";
import { HOME_OPINION_TOPICS } from "./home-opinion-topics";

describe("home opinion topics", () => {
  it("keeps the configured topic order and ratios", () => {
    expect(HOME_OPINION_TOPICS.map(({ id }) => id)).toEqual(["transfer-fare", "public-parking"]);
    expect(HOME_OPINION_TOPICS[1]?.items.map(({ ratio }) => ratio)).toEqual([39, 27, 34]);
    expect(HOME_OPINION_TOPICS[1]?.items[1].calloutAngle).toBe(-40);
  });

  it("keeps the existing callout angle when it is inside the segment", () => {
    expect(resolveCalloutAttachmentAngle(138, 82.8, 198)).toBe(138);
  });

  it("moves a callout angle inside a changed ratio segment", () => {
    const resolvedAngle = resolveCalloutAttachmentAngle(138, 7.2, 129.6);

    expect(resolvedAngle).toBeCloseTo(121.6);
    expect(resolvedAngle).toBeGreaterThan(7.2);
    expect(resolvedAngle).toBeLessThan(129.6);
  });
});
