import type { NextRequest } from "next/server";
import { proxyRag } from "@/lib/api/rag-client";

type Context = Readonly<{ params: Promise<{ uploadId: string }> }>;

export async function POST(request: NextRequest, context: Context) {
  const { uploadId } = await context.params;
  return proxyRag(
    request,
    `/internal/v1/rag/uploads/${encodeURIComponent(uploadId)}/complete`,
    "rag:documents:write",
  );
}
