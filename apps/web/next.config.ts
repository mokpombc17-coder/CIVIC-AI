import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const appDirectory = fileURLToPath(new URL("./app", import.meta.url));

export function validateDirectResourceRouteOwnership(routePaths: readonly string[]): void {
  const forbidden = routePaths.filter(
    (routePath) =>
      routePath.startsWith("api/v1/rag/") ||
      routePath.startsWith("stream/rag/") ||
      routePath.startsWith("api/v1/admin/simulations/") ||
      routePath.startsWith("api/v1/admin/simulation-"),
  );
  if (forbidden.length > 0) {
    throw new Error(`Web must not own RAG/Simulation route handlers: ${forbidden.join(", ")}`);
  }
  const required = [
    "api/v1/[...path]/route.ts",
    "api/v1/admin/room-creation-requests/[[...path]]/route.ts",
    "api/v1/admin/tasks/[[...path]]/route.ts",
  ];
  const missing = required.filter((routePath) => !routePaths.includes(routePath));
  if (missing.length > 0) {
    throw new Error(
      `Web Main/Auth, Chat, Vote route ownership is incomplete: ${missing.join(", ")}`,
    );
  }
}

function appRouteHandlers(directory: string, prefix = ""): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory()
      ? appRouteHandlers(path.join(directory, entry.name), relativePath)
      : entry.name === "route.ts"
        ? [relativePath]
        : [];
  });
}

validateDirectResourceRouteOwnership(appRouteHandlers(appDirectory));

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  poweredByHeader: false,
  typedRoutes: true,
  transpilePackages: ["@repo/bridge"],

  async redirects() {
    return [{ source: "/", destination: "/home", permanent: false }];
  },

  async rewrites() {
    const rawUpstream = process.env.CIVIC_E2E_RAG_UPSTREAM?.trim();
    if (!rawUpstream) return [];
    const upstream = new URL(rawUpstream);
    if (
      upstream.protocol !== "http:" ||
      !["127.0.0.1", "localhost", "::1"].includes(upstream.hostname) ||
      upstream.pathname !== "/" ||
      upstream.search ||
      upstream.hash ||
      upstream.username ||
      upstream.password
    ) {
      throw new Error("CIVIC_E2E_RAG_UPSTREAM must be a loopback HTTP origin");
    }
    return [
      {
        source: "/api/v1/rag/:path*",
        destination: `${upstream.origin}/internal/v1/rag/:path*`,
      },
      {
        source: "/stream/rag/queries/:jobId",
        destination: `${upstream.origin}/internal/v1/rag/queries/:jobId/events`,
      },
    ];
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
      {
        source: "/api/v1/rag/sources/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        ],
      },
      {
        source: "/api/v1/rag/documents/:documentId/versions/:versionId/preview",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
