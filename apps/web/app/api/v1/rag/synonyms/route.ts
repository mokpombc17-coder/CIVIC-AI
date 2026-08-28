import type { NextRequest } from "next/server";
import { proxyRag } from "@/lib/api/rag-client";

export function GET(request: NextRequest) {
  return proxyRag(request, "/internal/v1/rag/synonyms", "rag:documents:read");
}

export function POST(request: NextRequest) {
  return proxyRag(request, "/internal/v1/rag/synonyms", "rag:documents:write");
}
