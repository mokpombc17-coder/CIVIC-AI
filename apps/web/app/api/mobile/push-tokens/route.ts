import { z } from "zod";
import { serverEnv } from "@/lib/server/env";

const registrationSchema = z.object({
  expoPushToken: z.string().min(1).max(512),
  platform: z.enum(["ios", "android"]),
  appVersion: z.string().min(1).max(64).optional(),
});

export async function POST(request: Request): Promise<Response> {
  if (!serverEnv.PUSH_TOKEN_UPSTREAM_URL) {
    return Response.json({ error: "PUSH_TOKEN_UPSTREAM_URL is not configured." }, { status: 503 });
  }

  const requestOrigin = request.headers.get("origin");
  if (requestOrigin && requestOrigin !== new URL(request.url).origin) {
    return Response.json({ error: "Cross-origin requests are not allowed." }, { status: 403 });
  }

  const cookie = request.headers.get("cookie");
  const authorization = request.headers.get("authorization");
  if (!cookie && !authorization) {
    return Response.json({ error: "Authentication is required." }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const parsed = registrationSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "Invalid push token registration." }, { status: 400 });
  }

  const headers = new Headers({ "Content-Type": "application/json" });
  if (cookie) {
    headers.set("Cookie", cookie);
  }
  if (authorization) {
    headers.set("Authorization", authorization);
  }

  const upstream = await fetch(serverEnv.PUSH_TOKEN_UPSTREAM_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(parsed.data),
    cache: "no-store",
  });

  if (!upstream.ok) {
    return Response.json(
      { error: "Push token upstream rejected the registration." },
      { status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502 },
    );
  }

  return new Response(null, { status: 204 });
}
