import type { NextRequest } from "next/server";
import { proxyRag } from "@/lib/api/rag-client";

type Context = Readonly<{ params: Promise<{ documentId: string }> }>;

async function path(context: Context) {
  return `/internal/v1/rag/documents/${encodeURIComponent((await context.params).documentId)}/versions`;
}

export async function GET(request: NextRequest, context: Context) {
  return proxyRag(request, await path(context), "rag:documents:read");
}

export async function POST(request: NextRequest, context: Context) {
  return proxyRag(request, await path(context), "rag:documents:write");
}
