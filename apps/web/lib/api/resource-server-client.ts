import "server-only";

import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  applyCivicProductionCredential,
  CivicProductionCredentialError,
  resolveCivicProductionCredential,
} from "@/lib/server/civic-auth/production-credential-adapter";
import { isTrustedBrowserRequest } from "./browser-request-boundary";

type ResourceServerProxyConfig = Readonly<{
  browserOrigin: string;
  resourceUrl: URL;
  requestBackend?: typeof fetch;
}>;

export function createResourceServerProxy(config: ResourceServerProxyConfig) {
  const requestBackend = config.requestBackend ?? fetch;
  const browserOrigin = new URL(config.browserOrigin).origin;

  return async function proxyResourceServerRequest(
    incoming: NextRequest,
    upstreamPath: string,
    requiredScope: string,
  ): Promise<NextResponse> {
    const requestId = incoming.headers.get("x-request-id") ?? randomUUID();
    if (!isSafeUpstreamPath(upstreamPath)) return problem(404, "NOT_FOUND", requestId);
    if (!isTrustedBrowserRequest(incoming, browserOrigin)) {
      return problem(403, "FORBIDDEN", requestId);
    }

    let credential;
    try {
      credential = await resolveCivicProductionCredential({
        browserRequest: incoming,
        expectedOrigin: browserOrigin,
        requestId,
      });
    } catch (error) {
      return credentialProblem(error, requestId);
    }

    // Main/Auth owns scope issuance and each Resource Server owns enforcement.
    // The BFF keeps the required scope visible without parsing the opaque JWT.
    void requiredScope;
    const target = new URL(`${upstreamPath}${incoming.nextUrl.search}`, config.resourceUrl);
    const headers = applyCivicProductionCredential(
      forwardedRequestHeaders(incoming, requestId, browserOrigin),
      credential,
    );
    const requestInit: RequestInit & { duplex?: "half" } = {
      method: incoming.method,
      cache: "no-store",
      redirect: "manual",
      headers,
    };
    if (incoming.method !== "GET" && incoming.method !== "HEAD" && incoming.body) {
      requestInit.body = incoming.body;
      requestInit.duplex = "half";
    }

    let upstream: Response;
    try {
      upstream = await requestBackend(target, requestInit);
    } catch {
      return problem(503, "SERVICE_UNAVAILABLE", requestId);
    }
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: forwardedResponseHeaders(upstream, requestId),
    });
  };
}

export function unavailableResourceServer(request: NextRequest): NextResponse {
  return problem(503, "SERVICE_UNAVAILABLE", request.headers.get("x-request-id") ?? randomUUID());
}

function isSafeUpstreamPath(path: string): boolean {
  return path.startsWith("/api/v1/") && !path.includes("\\") && !path.split("/").includes("..");
}

function forwardedRequestHeaders(
  request: NextRequest,
  requestId: string,
  browserOrigin: string,
): Headers {
  const headers = new Headers({
    accept: request.headers.get("accept") ?? "application/json, application/problem+json",
    origin: browserOrigin,
    "sec-fetch-site": "same-origin",
    "x-request-id": requestId,
  });
  for (const name of ["content-type", "content-length", "idempotency-key"] as const) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

function forwardedResponseHeaders(response: Response, requestId: string): Headers {
  const headers = new Headers({ "cache-control": "private, no-store", "x-request-id": requestId });
  for (const name of [
    "content-type",
    "content-disposition",
    "etag",
    "location",
    "retry-after",
    "www-authenticate",
    "x-export-id",
    "x-export-sha256",
    "x-request-id",
    "x-trace-id",
  ] as const) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

function credentialProblem(error: unknown, requestId: string): NextResponse {
  if (error instanceof CivicProductionCredentialError) {
    return problem(error.status, error.code, requestId);
  }
  return problem(502, "MAIN_AUTH_INVALID_RESPONSE", requestId);
}

function problem(status: number, code: string, requestId: string): NextResponse {
  return NextResponse.json(
    { status, code, request_id: requestId },
    {
      status,
      headers: { "cache-control": "private, no-store", "x-request-id": requestId },
    },
  );
}
