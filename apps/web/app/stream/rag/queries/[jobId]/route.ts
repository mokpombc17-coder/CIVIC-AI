import { NextRequest } from "next/server";
import { proxyRag } from "@/lib/api/rag-client";

type Context = Readonly<{ params: Promise<{ jobId: string }> }>;

export async function GET(request: NextRequest, context: Context) {
  const { jobId } = await context.params;
  return proxyRag(
    request,
    `/internal/v1/rag/queries/${encodeURIComponent(jobId)}/events`,
    "rag:jobs:read",
  );
}
