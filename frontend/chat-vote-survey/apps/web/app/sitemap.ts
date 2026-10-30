import type { MetadataRoute } from "next";
import { createSitemap } from "@/lib/site-metadata";
import { resolveSiteUrl } from "@/lib/site-url";

export default function sitemap(): MetadataRoute.Sitemap {
  return createSitemap(resolveSiteUrl(process.env.SITE_URL));
}
