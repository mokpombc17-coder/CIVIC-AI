import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { proxyAdminDomain } from "@/lib/api/admin-domain-proxy";
import { matchSimulationOptionsRoute } from "@/lib/api/admin-domain-policy";

export async function GET(request: NextRequest) {
  const route = matchSimulationOptionsRoute(request.method);
  if ("status" in route) {
    return NextResponse.json({ status: route.status, code: "METHOD_NOT_ALLOWED" }, { status: 405 });
  }
  return proxyAdminDomain("simulation", request, route.path, route.scope);
}
