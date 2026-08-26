import "server-only";

import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { civicProductionServiceConfig } from "@/lib/server/civic-auth/production-service-config";
import {
  PLATFORM_AUTH_COOKIE_NAME,
  PLATFORM_AUTH_FLOW_COOKIE_NAME,
  PLATFORM_REFRESH_COOKIE_NAME,
} from "@/lib/server/auth/platform-auth-contract";
import { isTrustedBrowserRequest } from "./browser-request-boundary";
import { matchMainAuthRoute } from "./main-auth-policy";
import { readSafeMainAuthSetCookies } from "./response-cookie-boundary";

const allowedRequestCookies = new Set([
  PLATFORM_AUTH_COOKIE_NAME,
  PLATFORM_REFRESH_COOKIE_NAME,
  PLATFORM_AUTH_FLOW_COOKIE_NAME,
]);
const mutationMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

type MainAuthProxyConfig = Readonly<{
  browserOrigin: string;
  mainAuthUrl: URL;
  requestBackend?: typeof fetch;
}>;

export function createMainAuthProxy(config: MainAuthProxyConfig) {
  const requestBackend = config.requestBackend ?? fetch;
  const browserOrigin = new URL(config.browserOrigin).origin;

  return async function proxyMainAuthRequest(
    request: NextRequest,
    upstreamPath: string,
  ): Promise<NextResponse> {
    const route = matchMainAuthRoute(request.method, upstreamPath);
    const requestId = request.headers.get("x-request-id") ?? randomUUID();
    if ("status" in route) {
      const headers = new Headers({
        "cache-control": "private, no-store",
        "x-request-id": requestId,
      });
      if (route.status === 405) headers.set("allow", route.allowedMethods.join(", "));
      return problem(
        route.status,
        route.status === 404 ? "NOT_FOUND" : "METHOD_NOT_ALLOWED",
        requestId,
        headers,
      );
    }
    if (!isTrustedBrowserRequest(request, browserOrigin)) {
      return problem(403, "FORBIDDEN", requestId);
    }

    const cookies = allowlistedCookieHeader(request.headers.get("cookie"));
    if (!cookies.valid) return problem(401, "CREDENTIAL_MISMATCH", requestId);
    const cookie = cookies.value;
    const headers = new Headers({
      accept: request.headers.get("accept") ?? "application/json, application/problem+json",
      origin: browserOrigin,
      "sec-fetch-site": "same-origin",
      "x-request-id": requestId,
    });
    if (cookie) headers.set("cookie", cookie);
    const contentType =
      request.headers.get("content-type") ??
      (mutationMethods.has(request.method.toUpperCase()) ? "application/json" : null);
    if (contentType) headers.set("content-type", contentType);

    if (route.requiresCsrf) {
      const csrfToken = await fetchCsrf({
        cookie,
        mainAuthUrl: config.mainAuthUrl,
        requestBackend,
        requestId,
      });
      if (csrfToken instanceof NextResponse) return csrfToken;
      headers.set("x-csrf-token", csrfToken);
    }

    const target = new URL(upstreamPath + request.nextUrl.search, config.mainAuthUrl);
    const requestInit: RequestInit & { duplex?: "half" } = {
      method: request.method,
      cache: "no-store",
      redirect: "manual",
      headers,
    };
    if (request.method !== "GET" && request.method !== "HEAD" && request.body) {
      requestInit.body = request.body;
      requestInit.duplex = "half";
    }

    let upstream: Response;
    try {
      upstream = await requestBackend(target, requestInit);
    } catch {
      return problem(503, "SERVICE_UNAVAILABLE", requestId);
    }
    const responseHeaders = responseHeadersFrom(upstream, requestId);
    for (const setCookie of readSafeMainAuthSetCookies(upstream.headers)) {
      responseHeaders.append("set-cookie", setCookie);
    }
    return new NextResponse(upstream.body, { status: upstream.status, headers: responseHeaders });
  };
}

export async function proxyMainAuth(
  request: NextRequest,
  upstreamPath: string,
): Promise<NextResponse> {
  const { browserOrigin, mainAuthUrl } = civicProductionServiceConfig;
  if (!browserOrigin || !mainAuthUrl) {
    return problem(503, "SERVICE_UNAVAILABLE", request.headers.get("x-request-id") ?? randomUUID());
  }
  return createMainAuthProxy({ browserOrigin, mainAuthUrl: new URL(mainAuthUrl) })(
    request,
    upstreamPath,
  );
}

type CsrfContext = Readonly<{
  cookie: string | undefined;
  mainAuthUrl: URL;
  requestBackend: typeof fetch;
  requestId: string;
}>;

async function fetchCsrf(context: CsrfContext): Promise<string | NextResponse> {
  if (!context.cookie) return problem(401, "UNAUTHORIZED", context.requestId);
  let response: Response;
  try {
    response = await context.requestBackend(new URL("/api/v1/auth/csrf", context.mainAuthUrl), {
      cache: "no-store",
      headers: { cookie: context.cookie, "x-request-id": context.requestId },
    });
  } catch {
    return problem(503, "SERVICE_UNAVAILABLE", context.requestId);
  }
  if (!response.ok) return problem(response.status, "CSRF_REJECTED", context.requestId);
  const body = (await response.json().catch(() => null)) as { csrf_token?: unknown } | null;
  return typeof body?.csrf_token === "string" && body.csrf_token
    ? body.csrf_token
    : problem(502, "INVALID_UPSTREAM_RESPONSE", context.requestId);
}

function allowlistedCookieHeader(
  header: string | null,
): Readonly<{ valid: boolean; value?: string }> {
  if (!header) return { valid: true };
  const values: string[] = [];
  const names = new Set<string>();
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name && allowedRequestCookies.has(name) && rest.length > 0 && rest.join("=")) {
      if (!names.add(name)) return { valid: false };
      values.push(`${name}=${rest.join("=")}`);
    }
  }
  return values.length > 0 ? { valid: true, value: values.join("; ") } : { valid: true };
}

function responseHeadersFrom(response: Response, requestId: string): Headers {
  const headers = new Headers({ "cache-control": "private, no-store", "x-request-id": requestId });
  for (const name of ["content-type", "retry-after", "www-authenticate"] as const) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

function problem(
  status: number,
  code: string,
  requestId: string,
  headers = new Headers({ "cache-control": "private, no-store", "x-request-id": requestId }),
): NextResponse {
  return NextResponse.json({ status, code, request_id: requestId }, { status, headers });
}
