import type { NextRequest } from "next/server";
import { proxyRag } from "@/lib/api/rag-client";

export function POST(request: NextRequest) {
  return proxyRag(request, "/internal/v1/rag/crawler/preview-sessions", "rag:documents:write");
}
