import { NextRequest, NextResponse } from "next/server";
import { isTrustedBrowserRequest } from "@/lib/api/browser-request-boundary";
import { civicProductionServiceConfig } from "@/lib/server/civic-auth/production-service-config";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function POST(request: NextRequest) {
  const origin = civicProductionServiceConfig.browserOrigin;
  if (!origin) return NextResponse.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 });
  if (!isTrustedBrowserRequest(request, origin)) {
    return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as { job_id?: unknown } | null;
  if (!body || typeof body.job_id !== "string" || !UUID.test(body.job_id)) {
    return NextResponse.json({ code: "BAD_REQUEST" }, { status: 400 });
  }
  return NextResponse.json({
    stream_path: `/stream/rag/queries/${encodeURIComponent(body.job_id)}`,
  });
}
