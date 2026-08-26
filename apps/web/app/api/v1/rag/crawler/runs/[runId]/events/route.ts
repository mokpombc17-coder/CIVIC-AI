import type { NextRequest } from "next/server";
import { proxyRag } from "@/lib/api/rag-client";

type Context = Readonly<{ params: Promise<{ runId: string }> }>;

export async function GET(request: NextRequest, context: Context) {
  const { runId } = await context.params;
  return proxyRag(
    request,
    `/internal/v1/rag/crawler/runs/${encodeURIComponent(runId)}/events`,
    "rag:documents:read",
  );
}
