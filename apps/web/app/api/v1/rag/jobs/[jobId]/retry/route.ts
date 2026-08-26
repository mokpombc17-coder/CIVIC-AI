import type { NextRequest } from "next/server";
import { proxyRag } from "@/lib/api/rag-client";

type Context = Readonly<{ params: Promise<{ jobId: string }> }>;

export async function POST(request: NextRequest, context: Context) {
  return proxyRag(
    request,
    `/internal/v1/rag/jobs/${encodeURIComponent((await context.params).jobId)}/retry`,
    "rag:documents:write",
  );
}
