import type { NextRequest } from "next/server";
import { proxyRag } from "@/lib/api/rag-client";

type Context = Readonly<{ params: Promise<{ jobId: string }> }>;

export async function PUT(request: NextRequest, context: Context) {
  const { jobId } = await context.params;
  return proxyRag(
    request,
    `/internal/v1/rag/queries/${encodeURIComponent(jobId)}/feedback`,
    "rag:queries:write",
  );
}
