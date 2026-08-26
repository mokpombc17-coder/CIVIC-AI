import type { NextRequest } from "next/server";
import { proxyRag } from "@/lib/api/rag-client";

type Context = Readonly<{ params: Promise<{ uploadId: string; partNumber: string }> }>;

export async function PUT(request: NextRequest, context: Context) {
  const { uploadId, partNumber } = await context.params;
  return proxyRag(
    request,
    `/internal/v1/rag/uploads/${encodeURIComponent(uploadId)}/parts/${encodeURIComponent(partNumber)}`,
    "rag:documents:write",
  );
}
