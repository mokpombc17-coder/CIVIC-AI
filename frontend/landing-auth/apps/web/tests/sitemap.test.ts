import { describe, expect, it } from "vitest";
import sitemap from "../app/sitemap";

describe("sitemap", () => {
  it("검색 노출이 허용된 홈 페이지만 제공한다", () => {
    expect(sitemap()).toEqual([
      {
        url: "https://example.com/home",
      },
    ]);
  });
});
