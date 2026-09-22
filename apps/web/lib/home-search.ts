import type { Metadata } from "next";

export const HOME_SEARCH_TITLE = "CIVIC.AI - 전남광주";

export const HOME_SEARCH_DESCRIPTION =
  "CIVIC.AI는 자료를 살펴보고, 다양한 생각을 나누며, 투표로 의견을 더하는 AI 기반 시민 참여 플랫폼입니다.";

export const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "CIVIC AI",
  alternateName: "CIVIC AI 전남광주",
  url: "https://civic-ai.co.kr/",
} as const;

export const homeMetadata = {
  alternates: {
    canonical: "https://civic-ai.co.kr/home",
  },
  robots: {
    follow: true,
    index: true,
  },
  description: HOME_SEARCH_DESCRIPTION,
  title: {
    absolute: HOME_SEARCH_TITLE,
  },
} satisfies Metadata;
