import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "CIVIC.AI",
    short_name: "CIVIC.AI",
    description: "자료를 확인하고 의견을 나누며 투표에 참여하는 시민 참여 플랫폼",
    start_url: "/pwa/start",
    scope: "/",
    display: "standalone",
    background_color: "#f5f7fb",
    theme_color: "#f5f7fb",
    lang: "ko",
    icons: [
      {
        src: "/icons/civic-ai-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/civic-ai-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/civic-ai-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
