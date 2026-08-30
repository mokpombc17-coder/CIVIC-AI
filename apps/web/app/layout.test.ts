import { describe, expect, it } from "vitest";
import { metadata, viewport } from "./layout";

describe("root layout metadata", () => {
  it("references the PWA manifest and icons owned by the shared public origin", () => {
    expect(metadata).toMatchObject({
      applicationName: "CIVIC.AI",
      manifest: "/manifest.webmanifest",
      appleWebApp: {
        capable: true,
        statusBarStyle: "default",
        title: "CIVIC.AI",
      },
      icons: {
        icon: [
          {
            url: "/icons/civic-ai-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            url: "/icons/civic-ai-512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
        apple: [
          {
            url: "/icons/apple-touch-icon.png",
            sizes: "180x180",
            type: "image/png",
          },
        ],
      },
    });
  });

  it("preserves the existing site title and viewport settings", () => {
    expect(metadata).toMatchObject({
      title: {
        default: "Civic AI Platform",
        template: "%s | Civic AI Platform",
      },
    });
    expect(viewport).toMatchObject({
      width: "device-width",
      initialScale: 1,
      viewportFit: "cover",
      themeColor: "#f5f7fb",
    });
  });
});
