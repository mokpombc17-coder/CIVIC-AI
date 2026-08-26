import type { NextRequest } from "next/server";
import { proxyRag } from "@/lib/api/rag-client";

type Context = Readonly<{ params: Promise<{ versionId: string; page: string }> }>;

export async function GET(request: NextRequest, context: Context) {
  const { versionId, page } = await context.params;
  return proxyRag(
    request,
    `/internal/v1/rag/sources/${encodeURIComponent(versionId)}/pages/${encodeURIComponent(page)}`,
    "rag:documents:read",
  );
}
