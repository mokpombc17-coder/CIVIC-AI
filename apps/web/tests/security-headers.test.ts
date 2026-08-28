import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";
import { buildContentSecurityPolicy, config, proxy } from "../proxy";

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

  it("applies a unique nonce-based blocking CSP to page responses", () => {
    const first = proxy(new NextRequest("https://civic.example/rag"));
    const second = proxy(new NextRequest("https://civic.example/admin/rag"));
    const firstPolicy = first.headers.get("content-security-policy");
    const secondPolicy = second.headers.get("content-security-policy");

    expect(firstPolicy).toContain("default-src 'self'");
    expect(firstPolicy).toContain("script-src 'self' 'nonce-");
    // Turbopack 청크의 nonce 누락과 충돌하므로 strict-dynamic은 사용하지 않는다.
    expect(firstPolicy).not.toContain("'strict-dynamic'");
    expect(firstPolicy).toContain("object-src 'none'");
    expect(firstPolicy).toContain("frame-ancestors 'none'");
    expect(firstPolicy).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(firstPolicy).not.toBe(secondPolicy);
    expect(JSON.stringify(config.matcher)).toContain("(?!api|");
  });

  it("limits development-only eval and websocket allowances to development policy", () => {
    const production = buildContentSecurityPolicy("production-nonce", false);
    const development = buildContentSecurityPolicy("development-nonce", true);

    expect(production).not.toContain("'unsafe-eval'");
    expect(production).not.toContain(" ws: wss:");
    expect(production).toContain("upgrade-insecure-requests");
    expect(development).toContain("'unsafe-eval'");
    expect(development).toContain("connect-src 'self' ws: wss:");
    expect(development).not.toContain("upgrade-insecure-requests");
  });

  it("enables one-year HSTS on the HTTPS edge template", async () => {
    const template = await readFile(
      path.join(process.cwd(), "deploy/nginx/next-webview.conf"),
      "utf8",
    );
    expect(template).toContain('add_header Strict-Transport-Security "max-age=31536000" always;');
    expect(template).not.toContain("includeSubDomains");
    expect(template).not.toContain("preload");
  });

  it("routes RAG and Simulation paths directly at the HTTPS edge", async () => {
    const template = await readFile(
      path.join(process.cwd(), "deploy/nginx/next-webview.conf"),
      "utf8",
    );

    expect(template).toContain("upstream rag_resource");
    expect(template).toContain("server 127.0.0.1:8000;");
    expect(template).toContain("upstream simulation_resource");
    expect(template).toContain("server 127.0.0.1:8090;");
    expect(template).toContain("location ^~ /api/v1/rag/");
    expect(template).toContain("/internal/v1/rag/$1");
    expect(template).toContain('location ~ "^/stream/rag/queries/');
    expect(template).toContain("location /stream/rag/queries/");
    expect(template).not.toContain("location ^~ /stream/rag/queries/");
    expect(template).toContain('location ~ "^/api/v1/admin/tasks/');
    expect(template).toContain("location ~ ^/api/v1/admin/(simulations");
  });

  it("keeps wireflow RAG traffic and direct RAG frames on the resource path", async () => {
    const wireflowConfig = await readFile(
      path.join(process.cwd(), "playwright.wireflow.config.ts"),
      "utf8",
    );
    const template = await readFile(
      path.join(process.cwd(), "deploy/nginx/next-webview.conf"),
      "utf8",
    );

    expect(wireflowConfig).toContain("CIVIC_E2E_RAG_UPSTREAM: MOCK_API_URL");
    expect(wireflowConfig).not.toContain("RAG_INTERNAL_URL: MOCK_API_URL");
    expect(template).toContain("map $request_uri $rag_frame_options");
    expect(template).toContain("map $request_uri $rag_frame_ancestors");
    expect(template).toContain("add_header X-Frame-Options $rag_frame_options always;");
    expect(template).toContain("add_header Content-Security-Policy $rag_frame_ancestors always;");
    expect(template).toContain("proxy_hide_header X-Frame-Options;");
    expect(template).toContain("proxy_hide_header Content-Security-Policy;");
    expect(template).toContain("~^/api/v1/rag/ DENY;");
    expect(template).toContain("~^/api/v1/rag/ \"frame-ancestors 'none'\";");
  });
});
