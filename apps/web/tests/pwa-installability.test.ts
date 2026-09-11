import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "../app/manifest";

const webRoot = path.resolve(import.meta.dirname, "..");

describe("PWA installability", () => {
  it("keeps the installed app on this origin and launches the PWA startup route", () => {
    const value = manifest();

    expect(value).toMatchObject({
      id: "/",
      name: "CIVIC.AI",
      short_name: "CIVIC.AI",
      start_url: "/pwa/start",
      scope: "/",
      display: "standalone",
      orientation: "portrait",
      background_color: "#f5f7fb",
      theme_color: "#f5f7fb",
      lang: "ko",
    });
    expect(value.start_url).not.toMatch(/^https?:\/\//);
    expect(value.scope).not.toMatch(/^https?:\/\//);
  });

  it.each([
    ["icons/civic-ai-192.png", 192],
    ["icons/civic-ai-512.png", 512],
    ["icons/apple-touch-icon.png", 180],
  ])("provides %s at the declared square size", (relativePath, size) => {
    const image = readFileSync(path.join(webRoot, "public", relativePath));

    expect(pngDimensions(image)).toEqual([size, size]);
  });

  it("declares regular and maskable install icons", () => {
    expect(manifest().icons).toEqual([
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
    ]);
  });
});

function pngDimensions(buffer: Buffer): readonly [number, number] {
  const pngSignature = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== pngSignature) {
    throw new TypeError("PWA icon must be a PNG");
  }
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}
