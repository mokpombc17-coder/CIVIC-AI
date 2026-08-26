import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("response framing headers", () => {
  it("keeps pages frame-denied while allowing same-origin RAG PDF frames", async () => {
    const rules = await nextConfig.headers?.();
    expect(rules).toBeDefined();
    const defaultRule = rules?.find((rule) => rule.source === "/:path*");
    const citationRule = rules?.find((rule) => rule.source === "/api/v1/rag/sources/:path*");
    const previewRule = rules?.find(
      (rule) => rule.source === "/api/v1/rag/documents/:documentId/versions/:versionId/preview",
    );
    expect(defaultRule?.headers).toContainEqual({ key: "X-Frame-Options", value: "DENY" });
    for (const frameRule of [citationRule, previewRule]) {
      expect(frameRule?.headers).toContainEqual({
        key: "X-Frame-Options",
        value: "SAMEORIGIN",
      });
      expect(frameRule?.headers).toContainEqual({
        key: "Content-Security-Policy",
        value: "frame-ancestors 'self'",
      });
    }
  });
});
