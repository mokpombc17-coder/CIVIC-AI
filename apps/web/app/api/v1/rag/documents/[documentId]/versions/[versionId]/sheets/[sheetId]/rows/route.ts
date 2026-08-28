import type { NextRequest } from "next/server";
import { proxyRag } from "@/lib/api/rag-client";

type Context = Readonly<{
  params: Promise<{ documentId: string; versionId: string; sheetId: string }>;
}>;

export async function GET(request: NextRequest, context: Context) {
  const { documentId, versionId, sheetId } = await context.params;
  return proxyRag(
    request,
    `/internal/v1/rag/documents/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(versionId)}/sheets/${encodeURIComponent(sheetId)}/rows`,
    "rag:documents:read",
  );
}
