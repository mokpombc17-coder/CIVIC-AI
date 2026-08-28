import { afterEach, describe, expect, it } from "vitest";
import nextConfig, { validateDirectResourceRouteOwnership } from "../next.config";

const originalUpstream = process.env.CIVIC_E2E_RAG_UPSTREAM;

afterEach(() => {
  if (originalUpstream === undefined) delete process.env.CIVIC_E2E_RAG_UPSTREAM;
  else process.env.CIVIC_E2E_RAG_UPSTREAM = originalUpstream;
});

describe("direct resource route boundary", () => {
  it("RAG와 Simulation 핸들러 재도입을 거부하고 Main/Auth, Chat, Vote 소유권을 보존한다", () => {
    expect(() =>
      validateDirectResourceRouteOwnership([
        "api/v1/[...path]/route.ts",
        "api/v1/admin/room-creation-requests/[[...path]]/route.ts",
        "api/v1/admin/tasks/[[...path]]/route.ts",
      ]),
    ).not.toThrow();
    expect(() =>
      validateDirectResourceRouteOwnership([
        "api/v1/[...path]/route.ts",
        "api/v1/rag/folders/route.ts",
        "api/v1/admin/room-creation-requests/[[...path]]/route.ts",
        "api/v1/admin/tasks/[[...path]]/route.ts",
      ]),
    ).toThrow(/RAG\/Simulation/);
    expect(() =>
      validateDirectResourceRouteOwnership([
        "api/v1/[...path]/route.ts",
        "api/v1/admin/simulations/[[...path]]/route.ts",
        "api/v1/admin/room-creation-requests/[[...path]]/route.ts",
        "api/v1/admin/tasks/[[...path]]/route.ts",
      ]),
    ).toThrow(/RAG\/Simulation/);
  });

  it("설치 브라우저 전용 rewrite가 공개 RAG 경로를 mock 리소스 서버로 보낸다", async () => {
    process.env.CIVIC_E2E_RAG_UPSTREAM = "http://127.0.0.1:4792";

    const rewrites = await nextConfig.rewrites?.();

    expect(rewrites).toEqual([
      {
        source: "/api/v1/rag/:path*",
        destination: "http://127.0.0.1:4792/internal/v1/rag/:path*",
      },
      {
        source: "/stream/rag/queries/:jobId",
        destination: "http://127.0.0.1:4792/internal/v1/rag/queries/:jobId/events",
      },
    ]);
  });
});
