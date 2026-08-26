import type { NextRequest } from "next/server";
import { proxyRag } from "@/lib/api/rag-client";

type Context = Readonly<{
  params: Promise<{ documentId: string; versionId: string }>;
}>;

export async function GET(request: NextRequest, context: Context) {
  const { documentId, versionId } = await context.params;
  return proxyRag(
    request,
    `/internal/v1/rag/documents/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(versionId)}/preview`,
    "rag:documents:read",
  );
}
