import { afterEach, describe, expect, it } from "vitest";
import nextConfig, {
  MAIN_ASSET_PREFIX,
  assetPrefixForEnvironment,
  shouldCompressNextResponses,
  validateDirectResourceRouteOwnership,
} from "../next.config";

const originalUpstream = process.env.CIVIC_E2E_RAG_UPSTREAM;
const originalDevRagUpstream = process.env.CIVIC_DEV_RAG_UPSTREAM;
const originalDevSimulationUpstream = process.env.CIVIC_DEV_SIMULATION_UPSTREAM;
const originalNodeEnvironment = process.env.NODE_ENV;

afterEach(() => {
  if (originalUpstream === undefined) delete process.env.CIVIC_E2E_RAG_UPSTREAM;
  else process.env.CIVIC_E2E_RAG_UPSTREAM = originalUpstream;
  if (originalDevRagUpstream === undefined) delete process.env.CIVIC_DEV_RAG_UPSTREAM;
  else process.env.CIVIC_DEV_RAG_UPSTREAM = originalDevRagUpstream;
  if (originalDevSimulationUpstream === undefined) delete process.env.CIVIC_DEV_SIMULATION_UPSTREAM;
  else process.env.CIVIC_DEV_SIMULATION_UPSTREAM = originalDevSimulationUpstream;
  if (originalNodeEnvironment === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
  else Reflect.set(process.env, "NODE_ENV", originalNodeEnvironment);
});

describe("direct resource route boundary", () => {
  it("이관 전 설문 주소를 3001이 소유한 정식 /survey 경로로 보낸다", async () => {
    const redirects = await nextConfig.redirects?.();

    expect(redirects).toContainEqual({
      source: "/account/survey",
      destination: "/survey",
      permanent: false,
    });
    expect(redirects).toContainEqual({
      source: "/mypage/survey",
      destination: "/survey",
      permanent: false,
    });
  });

  it("운영 정적 청크를 3001과 겹치지 않는 Front2 전용 prefix로 분리한다", () => {
    expect(MAIN_ASSET_PREFIX).toBe("/main-assets");
    expect(assetPrefixForEnvironment("production")).toBe(MAIN_ASSET_PREFIX);
    expect(assetPrefixForEnvironment("development")).toBeUndefined();
    expect(assetPrefixForEnvironment("test")).toBeUndefined();
  });

  it("버전 지정 폰트와 navigation 이미지에 immutable 브라우저 캐시를 적용한다", async () => {
    const headers = await nextConfig.headers?.();
    const immutableHeader = {
      key: "Cache-Control",
      value: "public, max-age=31536000, immutable",
    };

    expect(headers).toContainEqual({
      source: "/fonts/pretendard-gov/:path*",
      headers: [immutableHeader],
    });
    expect(headers).toContainEqual({
      source: "/assets/platform-navigation/:path*",
      headers: [immutableHeader],
    });
  });

  it("설치 브라우저 RAG rewrite에서는 SSE 조각을 버퍼링하는 Next 압축을 끈다", () => {
    expect(shouldCompressNextResponses(undefined)).toBe(true);
    expect(shouldCompressNextResponses("  ")).toBe(true);
    expect(shouldCompressNextResponses("http://127.0.0.1:4792")).toBe(false);
  });

  it("RAG와 Simulation 핸들러 재도입을 거부하고 Main/Auth, Chat, Vote 소유권을 보존한다", () => {
    expect(() =>
      validateDirectResourceRouteOwnership([
        "api/v1/[...path]/route.ts",
        "api/v1/rooms/route.ts",
        "api/v1/admin/room-creation-requests/[[...path]]/route.ts",
        "api/v1/admin/rooms/route.ts",
        "api/v1/admin/rooms/[roomId]/commands/close/route.ts",
        "api/v1/admin/rooms/[roomId]/conversation-exports/route.ts",
        "api/v1/admin/tasks/[[...path]]/route.ts",
      ]),
    ).not.toThrow();
    expect(() =>
      validateDirectResourceRouteOwnership([
        "api/v1/[...path]/route.ts",
        "api/v1/rooms/route.ts",
        "api/v1/rag/folders/route.ts",
        "api/v1/admin/room-creation-requests/[[...path]]/route.ts",
        "api/v1/admin/tasks/[[...path]]/route.ts",
      ]),
    ).toThrow(/RAG\/Simulation/);
    expect(() =>
      validateDirectResourceRouteOwnership([
        "api/v1/[...path]/route.ts",
        "api/v1/rooms/route.ts",
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

  it("로컬 개발에서 RAG와 Simulation 공개 경로를 loopback 리소스 서버로 보낸다", async () => {
    delete process.env.CIVIC_E2E_RAG_UPSTREAM;
    Reflect.set(process.env, "NODE_ENV", "development");
    process.env.CIVIC_DEV_RAG_UPSTREAM = "http://127.0.0.1:8000";
    process.env.CIVIC_DEV_SIMULATION_UPSTREAM = "http://127.0.0.1:8090";

    const rewrites = await nextConfig.rewrites?.();

    expect(rewrites).toContainEqual({
      source: "/api/v1/rag/:path*",
      destination: "http://127.0.0.1:8000/internal/v1/rag/:path*",
    });
    expect(rewrites).toContainEqual({
      source: "/api/v1/admin/simulations/:path*",
      destination: "http://127.0.0.1:8090/api/v1/admin/simulations/:path*",
    });
    expect(rewrites).toContainEqual({
      source: "/api/v1/admin/simulation-options",
      destination: "http://127.0.0.1:8090/api/v1/admin/simulation-options",
    });
  });

  it("IPv6 loopback 리소스 origin을 로컬 개발 rewrite로 허용한다", async () => {
    delete process.env.CIVIC_E2E_RAG_UPSTREAM;
    Reflect.set(process.env, "NODE_ENV", "development");
    process.env.CIVIC_DEV_RAG_UPSTREAM = "http://[::1]:8000";
    delete process.env.CIVIC_DEV_SIMULATION_UPSTREAM;

    const rewrites = await nextConfig.rewrites?.();

    expect(rewrites).toContainEqual({
      source: "/api/v1/rag/:path*",
      destination: "http://[::1]:8000/internal/v1/rag/:path*",
    });
  });

  it("production Next.js는 개발용 resource rewrite를 활성화하지 않는다", async () => {
    delete process.env.CIVIC_E2E_RAG_UPSTREAM;
    Reflect.set(process.env, "NODE_ENV", "production");
    process.env.CIVIC_DEV_RAG_UPSTREAM = "http://127.0.0.1:8000";
    process.env.CIVIC_DEV_SIMULATION_UPSTREAM = "http://127.0.0.1:8090";

    await expect(nextConfig.rewrites?.()).resolves.toEqual([]);
  });
});
