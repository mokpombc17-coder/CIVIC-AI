import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { proxyAdminDomain } from "@/lib/api/admin-domain-proxy";
import { matchOpinionMapGenerationAdminRoute } from "@/lib/api/admin-domain-policy";

type RouteContext = Readonly<{ params: Promise<{ path?: string[] }> }>;

async function proxy(request: NextRequest, context: RouteContext) {
  const segments = (await context.params).path ?? [];
  const route = matchOpinionMapGenerationAdminRoute(request.method, segments);
  if ("status" in route) {
    return NextResponse.json(
      { status: route.status, code: route.status === 404 ? "NOT_FOUND" : "METHOD_NOT_ALLOWED" },
      {
        status: route.status,
        ...(route.status === 405 ? { headers: { allow: route.allowedMethods.join(", ") } } : {}),
      },
    );
  }
  return proxyAdminDomain("vote", request, route.path, route.scope);
}

export const GET = proxy;
