import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { proxyAdminDomain } from "@/lib/api/admin-domain-proxy";
import { matchChatRoomListRoute } from "@/lib/api/admin-domain-policy";

async function proxy(request: NextRequest) {
  const route = matchChatRoomListRoute(request.method);
  if ("status" in route) {
    return NextResponse.json(
      { status: route.status, code: "METHOD_NOT_ALLOWED" },
      { status: route.status, headers: { allow: route.allowedMethods.join(", ") } },
    );
  }
  return proxyAdminDomain("chat", request, route.path, route.scope);
}

export const GET = proxy;
export const PUT = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
