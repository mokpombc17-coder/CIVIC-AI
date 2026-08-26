import type { NextRequest } from "next/server";
import { proxyRag } from "@/lib/api/rag-client";

type Context = Readonly<{ params: Promise<{ jobId: string }> }>;

export async function GET(request: NextRequest, context: Context) {
  return proxyRag(
    request,
    `/internal/v1/rag/queries/${encodeURIComponent((await context.params).jobId)}`,
    "rag:jobs:read",
  );
}
