import type { NextRequest } from "next/server";
import { proxyMainAuth } from "@/lib/api/main-auth-client";
import { mainAuthProxyPath } from "@/lib/api/main-auth-policy";

type RouteContext = Readonly<{ params: Promise<{ path: string[] }> }>;

async function proxy(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return proxyMainAuth(request, mainAuthProxyPath(path));
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
