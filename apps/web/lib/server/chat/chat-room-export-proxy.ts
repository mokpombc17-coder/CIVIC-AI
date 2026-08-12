import "server-only";

import { CHAT_API_BASE_URL } from "@/lib/chat/chat-config";
import { chatRoomExportInputSchema } from "@/lib/chat/admin/chat-room-export-contracts";

type FetchRequest = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type ProxyChatRoomExportOptions = Readonly<{
  accessToken: string | undefined;
  apiBaseUrl?: string;
  request: Request;
  requestBackend?: FetchRequest;
  roomId: string;
}>;

const forwardedResponseHeaders = [
  "Content-Type",
  "Content-Disposition",
  "Content-Length",
  "Cache-Control",
  "Pragma",
  "X-Content-Type-Options",
  "X-Export-Id",
  "X-Export-SHA256",
] as const;

export async function proxyChatRoomExport({
  accessToken,
  apiBaseUrl = CHAT_API_BASE_URL,
  request,
  requestBackend = fetch,
  roomId,
}: ProxyChatRoomExportOptions): Promise<Response> {
  if (!hasSameOrigin(request)) {
    return problemResponse(request, {
      code: "ACCESS_DENIED",
      detail: "Cross-origin chat Export requests are not allowed.",
      status: 403,
      title: "Chat export access denied",
    });
  }

  if (!accessToken) {
    return problemResponse(request, {
      code: "UNAUTHENTICATED",
      detail: "Authentication is required.",
      status: 401,
      title: "Chat export authentication required",
    });
  }

  const parsedInput = chatRoomExportInputSchema.safeParse({
    roomId,
    ...(await readJson(request)),
  });

  if (!parsedInput.success) {
    return problemResponse(request, {
      code: "INVALID_REQUEST",
      detail: "The chat Export request is invalid.",
      status: 400,
      title: "Chat export request rejected",
    });
  }

  const backendUrl = createBackendExportUrl(apiBaseUrl, parsedInput.data.roomId);
  let backendResponse: Response;

  try {
    backendResponse = await requestBackend(backendUrl, {
      method: "POST",
      headers: {
        Accept: "application/zip",
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mode: parsedInput.data.mode }),
      cache: "no-store",
    });
  } catch {
    return problemResponse(request, {
      code: "CHAT_EXPORT_UNAVAILABLE",
      detail: "The chat Export service is temporarily unavailable.",
      retryable: true,
      status: 503,
      title: "Chat export unavailable",
    });
  }

  return new Response(backendResponse.body, {
    headers: copyForwardedHeaders(backendResponse.headers),
    status: backendResponse.status,
    statusText: backendResponse.statusText,
  });
}

function createBackendExportUrl(apiBaseUrl: string, roomId: string): URL {
  const normalizedBaseUrl = apiBaseUrl.endsWith("/") ? apiBaseUrl : `${apiBaseUrl}/`;
  return new URL(`admin/rooms/${encodeURIComponent(roomId)}/exports`, normalizedBaseUrl);
}

function copyForwardedHeaders(source: Headers): Headers {
  const target = new Headers();

  for (const name of forwardedResponseHeaders) {
    const value = source.get(name);

    if (value !== null) {
      target.set(name, value);
    }
  }

  return target;
}

function hasSameOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");

  if (!origin) {
    return false;
  }

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json();
    return isRecord(body) ? body : {};
  } catch {
    return {};
  }
}

function problemResponse(
  request: Request,
  problem: Readonly<{
    code: string;
    detail: string;
    retryable?: boolean;
    status: number;
    title: string;
  }>,
): Response {
  return Response.json(
    {
      type: `urn:civic-ai:problem:${problem.code.toLowerCase().replaceAll("_", "-")}`,
      title: problem.title,
      status: problem.status,
      detail: problem.detail,
      instance: new URL(request.url).pathname,
      code: problem.code,
      replayed: false,
      retryable: problem.retryable ?? false,
    },
    {
      status: problem.status,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/problem+json",
      },
    },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
