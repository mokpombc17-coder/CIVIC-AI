import { describe, expect, it, vi } from "vitest";
import { isStandalonePwa } from "./runtime";

describe("isStandalonePwa", () => {
  it("recognizes Chromium and iOS installed display modes", () => {
    const matchMedia = vi.fn().mockReturnValue({ matches: true });

    expect(isStandalonePwa(matchMedia, false)).toBe(true);
    expect(isStandalonePwa(undefined, true)).toBe(true);
    expect(isStandalonePwa(undefined, false)).toBe(false);
  });
});
