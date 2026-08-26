import type { NextRequest } from "next/server";
import { proxyRag } from "@/lib/api/rag-client";

type Context = Readonly<{ params: Promise<{ folderId: string }> }>;

async function path(context: Context) {
  return `/internal/v1/rag/folders/${encodeURIComponent((await context.params).folderId)}`;
}

export async function GET(request: NextRequest, context: Context) {
  return proxyRag(request, await path(context), "rag:documents:read");
}

export async function PATCH(request: NextRequest, context: Context) {
  return proxyRag(request, await path(context), "rag:documents:write");
}

export async function DELETE(request: NextRequest, context: Context) {
  return proxyRag(request, await path(context), "rag:documents:write");
}
