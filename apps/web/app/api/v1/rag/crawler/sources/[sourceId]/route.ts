import type { NextRequest } from "next/server";
import { proxyRag } from "@/lib/api/rag-client";

type Context = Readonly<{ params: Promise<{ sourceId: string }> }>;

async function path(context: Context) {
  const { sourceId } = await context.params;
  return `/internal/v1/rag/crawler/sources/${encodeURIComponent(sourceId)}`;
}

export async function PUT(request: NextRequest, context: Context) {
  return proxyRag(request, await path(context), "rag:documents:write");
}

export async function DELETE(request: NextRequest, context: Context) {
  return proxyRag(request, await path(context), "rag:documents:write");
}
