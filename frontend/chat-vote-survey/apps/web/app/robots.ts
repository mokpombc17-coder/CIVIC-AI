import type { MetadataRoute } from "next";
import { createRobots } from "@/lib/site-metadata";
import { resolveSiteUrl } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  return createRobots(resolveSiteUrl(process.env.SITE_URL));
}
