import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { proxyAdminDomain } from "@/lib/api/admin-domain-proxy";
import { matchSimulationTaskCatalogRoute } from "@/lib/api/admin-domain-policy";

type RouteContext = Readonly<{ params: Promise<{ path?: string[] }> }>;

export async function GET(request: NextRequest, context: RouteContext) {
  const route = matchSimulationTaskCatalogRoute(request.method, (await context.params).path ?? []);
  if ("status" in route) {
    return NextResponse.json({ status: route.status, code: "NOT_FOUND" }, { status: route.status });
  }
  return proxyAdminDomain("simulation", request, route.path, route.scope);
}
