import { describe, expect, it } from "vitest";
import {
  HOME_SEARCH_DESCRIPTION,
  HOME_SEARCH_TITLE,
  homeMetadata,
  websiteJsonLd,
} from "@/lib/home-search";

describe("home search metadata", () => {
  it("uses canonical search metadata for the home page", () => {
    expect(homeMetadata).toMatchObject({
      alternates: {
        canonical: "https://civic-ai.co.kr/home",
      },
      description: HOME_SEARCH_DESCRIPTION,
      robots: {
        follow: true,
        index: true,
      },
      title: {
        absolute: HOME_SEARCH_TITLE,
      },
    });
  });

  it("describes the canonical site name on the public root URL", () => {
    expect(websiteJsonLd).toEqual({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "CIVIC AI",
      alternateName: "CIVIC.AI 전남광주",
      url: "https://civic-ai.co.kr/",
    });
  });
});
