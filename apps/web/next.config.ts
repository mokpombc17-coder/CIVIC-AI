import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const appDirectory = fileURLToPath(new URL("./app", import.meta.url));

export const MAIN_ASSET_PREFIX = "/main-assets";

export function assetPrefixForEnvironment(environment: string | undefined): string | undefined {
  return environment === "production" ? MAIN_ASSET_PREFIX : undefined;
}

export function shouldCompressNextResponses(e2eRagUpstream: string | undefined): boolean {
  return !e2eRagUpstream?.trim();
}

function loopbackOrigin(rawValue: string | undefined, variableName: string): string | undefined {
  const rawOrigin = rawValue?.trim();
  if (!rawOrigin) return undefined;
  const origin = new URL(rawOrigin);
  if (
    origin.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname) ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    origin.username ||
    origin.password
  ) {
    throw new Error(`${variableName} must be a loopback HTTP origin`);
  }
  return origin.origin;
}

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
    "api/v1/rooms/route.ts",
    "api/v1/admin/room-creation-requests/[[...path]]/route.ts",
    "api/v1/admin/rooms/route.ts",
    "api/v1/admin/rooms/[roomId]/commands/close/route.ts",
    "api/v1/admin/rooms/[roomId]/conversation-exports/route.ts",
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

const assetPrefix = assetPrefixForEnvironment(process.env.NODE_ENV);
const nextConfig: NextConfig = {
  ...(assetPrefix ? { assetPrefix } : {}),
  // The installed-browser RAG mock must preserve incremental SSE chunks.
  // Next's development compression otherwise buffers the rewritten event stream.
  compress: shouldCompressNextResponses(process.env.CIVIC_E2E_RAG_UPSTREAM),
  output: "standalone",
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  poweredByHeader: false,
  typedRoutes: true,
  transpilePackages: ["@repo/bridge"],

  async redirects() {
    return [
      { source: "/", destination: "/home", permanent: false },
      { source: "/account/survey", destination: "/survey", permanent: false },
      { source: "/mypage/survey", destination: "/survey", permanent: false },
      { source: "/votes/:path*", destination: "/vote/:path*", permanent: true },
    ];
  },

  async rewrites() {
    const development = process.env.NODE_ENV !== "production";
    const e2eRagOrigin = loopbackOrigin(
      process.env.CIVIC_E2E_RAG_UPSTREAM,
      "CIVIC_E2E_RAG_UPSTREAM",
    );
    const ragOrigin =
      e2eRagOrigin ??
      (development
        ? loopbackOrigin(process.env.CIVIC_DEV_RAG_UPSTREAM, "CIVIC_DEV_RAG_UPSTREAM")
        : undefined);
    const simulationOrigin = development
      ? loopbackOrigin(process.env.CIVIC_DEV_SIMULATION_UPSTREAM, "CIVIC_DEV_SIMULATION_UPSTREAM")
      : undefined;
    return [
      ...(ragOrigin
        ? [
            {
              source: "/api/v1/rag/:path*",
              destination: `${ragOrigin}/internal/v1/rag/:path*`,
            },
            {
              source: "/stream/rag/queries/:jobId",
              destination: `${ragOrigin}/internal/v1/rag/queries/:jobId/events`,
            },
          ]
        : []),
      ...(simulationOrigin
        ? [
            {
              source: "/api/v1/admin/simulations/:path*",
              destination: `${simulationOrigin}/api/v1/admin/simulations/:path*`,
            },
            ...[
              "simulation-options",
              "simulation-capacity",
              "simulation-tasks/:path*",
              "simulation-billing/:path*",
            ].map((path) => ({
              source: `/api/v1/admin/${path}`,
              destination: `${simulationOrigin}/api/v1/admin/${path}`,
            })),
          ]
        : []),
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
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
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
