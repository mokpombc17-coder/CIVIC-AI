import type { NextRequest } from "next/server";
import { proxyRag } from "@/lib/api/rag-client";

type Context = Readonly<{ params: Promise<{ sessionHandle: string }> }>;

export async function DELETE(request: NextRequest, context: Context) {
  const { sessionHandle } = await context.params;
  return proxyRag(
    request,
    `/internal/v1/rag/crawler/preview-sessions/${encodeURIComponent(sessionHandle)}`,
    "rag:documents:write",
  );
}
