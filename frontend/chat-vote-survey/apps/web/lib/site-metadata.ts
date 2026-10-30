import type { MetadataRoute } from "next";

export function createRobots(siteUrl: URL | null): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: "/api/",
    },
    ...(siteUrl ? { sitemap: new URL("/sitemap.xml", siteUrl).href } : {}),
  };
}

export function createSitemap(siteUrl: URL | null): MetadataRoute.Sitemap {
  if (!siteUrl) {
    return [];
  }

  return [{ url: siteUrl.href }];
}
