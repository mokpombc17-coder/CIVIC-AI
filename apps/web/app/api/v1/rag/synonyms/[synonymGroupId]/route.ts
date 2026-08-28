import type { NextRequest } from "next/server";
import { proxyRag } from "@/lib/api/rag-client";

type Context = Readonly<{ params: Promise<{ synonymGroupId: string }> }>;

async function path(context: Context) {
  const { synonymGroupId } = await context.params;
  return `/internal/v1/rag/synonyms/${encodeURIComponent(synonymGroupId)}`;
}

export async function PUT(request: NextRequest, context: Context) {
  return proxyRag(request, await path(context), "rag:documents:write");
}

export async function DELETE(request: NextRequest, context: Context) {
  return proxyRag(request, await path(context), "rag:documents:write");
}
