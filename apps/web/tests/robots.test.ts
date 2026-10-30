import { describe, expect, it } from "vitest";
import robots from "../app/robots";

describe("robots", () => {
  it("모든 크롤러의 접근을 허용하고 사이트맵 위치를 제공한다", () => {
    expect(robots()).toEqual({
      rules: {
        userAgent: "*",
        allow: "/",
      },
      sitemap: "https://example.com/sitemap.xml",
    });
  });
});
