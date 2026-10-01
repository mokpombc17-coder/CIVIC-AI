import { describe, expect, it } from "vitest";
import {
  OPINION_RANK_COLORS,
  orderOpinionItemsForDisplay,
  resolveCalloutAttachmentAngle,
} from "@/components/screens/opinion-gathering-hero";
import { HOME_OPINION_TOPICS } from "./home-opinion-topics";

describe("home opinion topics", () => {
  it("keeps the configured topic order and ratios", () => {
    expect(HOME_OPINION_TOPICS.map(({ id }) => id)).toEqual([
      "transfer-fare",
      "public-parking",
      "tancheon-shared-path",
    ]);
    expect(HOME_OPINION_TOPICS[1]?.items.map(({ ratio }) => ratio)).toEqual([39, 27, 34]);
    expect(HOME_OPINION_TOPICS[2]?.items.map(({ ratio }) => ratio)).toEqual([24, 20, 56]);
  });

  it("places first through third rank from right to left with dark through light colors", () => {
    const parkingItems = HOME_OPINION_TOPICS[1]!.items;
    const displayItems = orderOpinionItemsForDisplay(parkingItems);

    expect(displayItems.map(({ label }) => label)).toEqual([
      "방문객·단기 주차 우선",
      "주민·장기 주차 우선",
      "선착순 이용",
    ]);
    expect(displayItems.map(({ ratio }) => ratio)).toEqual([27, 39, 34]);
    expect(OPINION_RANK_COLORS).toEqual({
      first: "#0054f5",
      second: "#5b92ff",
      third: "#d6e3ff",
    });
  });

  it("applies the same rank positions to the Tancheon shared path topic", () => {
    const displayItems = orderOpinionItemsForDisplay(HOME_OPINION_TOPICS[2]!.items);

    expect(displayItems.map(({ label }) => label)).toEqual([
      "보행 공간 확대",
      "자전거는 내려서 이동",
      "현재 구분 유지",
    ]);
    expect(displayItems.map(({ ratio }) => ratio)).toEqual([20, 56, 24]);
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
