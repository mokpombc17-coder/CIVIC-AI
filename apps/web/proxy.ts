import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { classifyBrowserSupport } from "./lib/browser-support";

const BROWSER_SUPPORT_PATH = "/supported-browsers";
const BROWSER_SUPPORT_BYPASS_PATHS = new Set([
  BROWSER_SUPPORT_PATH,
  "/supported-browsers.css",
  "/sw.js",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
]);
const STATIC_ASSET_PATH_PATTERN =
  /\.(?:avif|bmp|css|csv|gif|html|ico|jpe?g|js|json|map|mjs|mp3|mp4|ogg|otf|pdf|png|svg|txt|webmanifest|webm|webp|woff2?|xml)$/iu;

export function buildContentSecurityPolicy(
  nonce: string,
  development = process.env.NODE_ENV === "development",
): string {
  const directives = [
    "default-src 'self'",
    // 'strict-dynamic'은 넣지 않는다: Turbopack 프로덕션 빌드가 Flight 페이로드로 삽입하는
    // 일부 청크(<script src> 엘리먼트)에 nonce가 붙지 않아, host 허용('self')까지 무시하는
    // strict-dynamic 아래에서는 해당 청크가 차단되어 hydration 전체가 실패한다.
    `script-src 'self' 'nonce-${nonce}'${development ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    `connect-src 'self'${development ? " ws: wss:" : ""}`,
    "frame-src 'self' blob:",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(development ? [] : ["upgrade-insecure-requests"]),
  ];
  return directives.join("; ");
}

export function isBrowserSupportBypassPath(pathname: string): boolean {
  return (
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname === "/_next" ||
    pathname.startsWith("/_next/") ||
    pathname === BROWSER_SUPPORT_PATH ||
    pathname.startsWith(`${BROWSER_SUPPORT_PATH}/`) ||
    BROWSER_SUPPORT_BYPASS_PATHS.has(pathname) ||
    STATIC_ASSET_PATH_PATTERN.test(pathname)
  );
}

export function isDocumentNavigation(request: NextRequest): boolean {
  if (request.method !== "GET") {
    return false;
  }

  const destination = request.headers.get("sec-fetch-dest");
  if (destination && destination !== "document") {
    return false;
  }

  return request.headers.get("accept")?.includes("text/html") ?? false;
}

function createBrowserSupportRedirect(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = BROWSER_SUPPORT_PATH;
  url.search = "";

  const response = NextResponse.redirect(url, 307);
  response.headers.set("cache-control", "private, no-store");
  response.headers.set("vary", "User-Agent");
  return response;
}

export function proxy(request: NextRequest) {
  if (
    !isBrowserSupportBypassPath(request.nextUrl.pathname) &&
    isDocumentNavigation(request) &&
    classifyBrowserSupport(request.headers.get("user-agent") ?? "").support === "unsupported"
  ) {
    return createBrowserSupportRedirect(request);
  }

  const nonce = Buffer.from(randomUUID()).toString("base64");
  const contentSecurityPolicy = buildContentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("content-security-policy", contentSecurityPolicy);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", contentSecurityPolicy);
  return response;
}

export const config = {
  matcher: [
    {
      source:
        "/((?!api|_next|favicon\\.ico|sitemap\\.xml|robots\\.txt|sw\\.js|manifest\\.webmanifest|supported-browsers(?:/|$)|.*\\.(?:avif|bmp|css|csv|gif|html|ico|jpe?g|js|json|map|mjs|mp3|mp4|ogg|otf|pdf|png|svg|txt|webmanifest|webm|webp|woff2?|xml)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
