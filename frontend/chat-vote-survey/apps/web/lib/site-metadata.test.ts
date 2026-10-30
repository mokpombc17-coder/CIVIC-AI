import { describe, expect, it } from "vitest";
import { createRobots, createSitemap } from "./site-metadata";

describe("createRobots", () => {
  it("API crawl을 차단하고 SITE_URL이 없으면 sitemap을 광고하지 않는다", () => {
    expect(createRobots(null)).toEqual({
      rules: {
        userAgent: "*",
        allow: "/",
        disallow: "/api/",
      },
    });
  });

  it("SITE_URL이 설정되면 sitemap 절대 URL을 제공한다", () => {
    expect(createRobots(new URL("https://civic.example/"))).toEqual({
      rules: {
        userAgent: "*",
        allow: "/",
        disallow: "/api/",
      },
      sitemap: "https://civic.example/sitemap.xml",
    });
  });
});

describe("createSitemap", () => {
  it("SITE_URL이 없으면 공개 URL을 추측하지 않는다", () => {
    expect(createSitemap(null)).toEqual([]);
  });

  it("SITE_URL이 설정되면 홈을 공개 URL로 제공한다", () => {
    expect(createSitemap(new URL("https://civic.example/"))).toEqual([
      { url: "https://civic.example/" },
    ]);
  });
});
