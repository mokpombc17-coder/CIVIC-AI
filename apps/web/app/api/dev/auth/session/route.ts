import { NextResponse } from "next/server";
import { z } from "zod";
import {
  PLATFORM_AUTH_COOKIE_NAME,
  PLATFORM_AUTH_COOKIE_PATH,
} from "@/lib/server/auth/platform-auth-contract";
import {
  issueLocalPlatformJwt,
  LOCAL_PLATFORM_AUTH_TOKEN_TTL_SECONDS,
} from "@/lib/server/auth/local-platform-jwt";

const createSessionRequestSchema = z.object({
  subject: z.string().trim().min(1).max(128),
});

const noStoreHeaders = {
  "Cache-Control": "no-store",
};

export async function POST(request: Request): Promise<Response> {
  if (isProduction()) {
    return notFound();
  }

  const parsed = createSessionRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid request.",
        fields: parsed.error.flatten().fieldErrors,
      },
      {
        status: 400,
        headers: noStoreHeaders,
      },
    );
  }

  const token = await issueLocalPlatformJwt({
    subject: parsed.data.subject,
  });
  const response = new NextResponse(null, {
    status: 204,
    headers: noStoreHeaders,
  });
  response.cookies.set({
    name: PLATFORM_AUTH_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: PLATFORM_AUTH_COOKIE_PATH,
    maxAge: LOCAL_PLATFORM_AUTH_TOKEN_TTL_SECONDS,
  });

  return response;
}

export function DELETE(): Response {
  if (isProduction()) {
    return notFound();
  }

  const response = new NextResponse(null, {
    status: 204,
    headers: noStoreHeaders,
  });
  response.cookies.set({
    name: PLATFORM_AUTH_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: PLATFORM_AUTH_COOKIE_PATH,
    maxAge: 0,
    expires: new Date(0),
  });

  return response;
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function notFound(): Response {
  return NextResponse.json(
    { error: "Not found." },
    {
      status: 404,
      headers: noStoreHeaders,
    },
  );
}
