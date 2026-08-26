import "server-only";

import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  applyCivicProductionCredential,
  CivicProductionCredentialError,
  resolveCivicProductionCredential,
} from "@/lib/server/civic-auth/production-credential-adapter";
import type { CivicRagScope } from "@/lib/server/civic-auth/production-resource-scopes";
import { civicProductionServiceConfig } from "@/lib/server/civic-auth/production-service-config";
import { isTrustedBrowserRequest } from "./browser-request-boundary";

type RagProxyConfig = Readonly<{
  browserOrigin: string;
  ragUrl: URL;
  requestBackend?: typeof fetch;
}>;

export function createRagProxy(config: RagProxyConfig) {
  const requestBackend = config.requestBackend ?? fetch;
  const browserOrigin = new URL(config.browserOrigin).origin;

  return async function proxyRagRequest(
    incoming: NextRequest,
    upstreamPath: string,
    requiredScope: CivicRagScope,
  ): Promise<NextResponse> {
    const requestId = incoming.headers.get("x-request-id") ?? randomUUID();
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

    // Main/Auth owns scope issuance and RAG owns enforcement. The route's typed
    // scope documents that contract without decoding the JWT in Frontend.
    void requiredScope;
    const target = new URL(upstreamPath + incoming.nextUrl.search, config.ragUrl);
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
    const responseHeaders = forwardedResponseHeaders(upstream, requestId);
    return new NextResponse(upstream.body, { status: upstream.status, headers: responseHeaders });
  };
}

export async function proxyRag(
  incoming: NextRequest,
  upstreamPath: string,
  requiredScope: CivicRagScope,
): Promise<NextResponse> {
  const { browserOrigin, ragUrl } = civicProductionServiceConfig;
  if (!browserOrigin || !ragUrl) {
    return problem(
      503,
      "SERVICE_UNAVAILABLE",
      incoming.headers.get("x-request-id") ?? randomUUID(),
    );
  }
  return createRagProxy({
    browserOrigin,
    ragUrl: new URL(ragUrl),
  })(incoming, upstreamPath, requiredScope);
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
  for (const name of [
    "content-type",
    "content-length",
    "idempotency-key",
    "last-event-id",
    "range",
    "x-content-sha256",
  ] as const) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

function forwardedResponseHeaders(response: Response, requestId: string): Headers {
  const headers = new Headers({ "cache-control": "private, no-store", "x-request-id": requestId });
  for (const name of [
    "content-type",
    "content-range",
    "accept-ranges",
    "content-disposition",
    "etag",
    "last-modified",
    "retry-after",
    "x-accel-buffering",
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
