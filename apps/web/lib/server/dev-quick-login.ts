import "server-only";

import { NextRequest, NextResponse } from "next/server";

type DevCredential = Readonly<{ email: string; password: string }>;

export type DevQuickLoginConfig = Readonly<{
  host: string;
  user: DevCredential;
  admin: DevCredential;
}>;

type LoginProxy = (request: NextRequest, upstreamPath: string) => Promise<NextResponse>;

type DevQuickLoginEnv = Readonly<Record<string, string | undefined>>;

export function readDevQuickLoginConfig(env: DevQuickLoginEnv): DevQuickLoginConfig | null {
  const host = value(env.CIVIC_DEV_QUICK_LOGIN_HOST);
  const userEmail = value(env.CIVIC_DEV_QUICK_LOGIN_USER_EMAIL);
  const userPassword = value(env.CIVIC_DEV_QUICK_LOGIN_USER_PASSWORD);
  const adminEmail = value(env.CIVIC_DEV_QUICK_LOGIN_ADMIN_EMAIL);
  const adminPassword = value(env.CIVIC_DEV_QUICK_LOGIN_ADMIN_PASSWORD);
  if (!host || !userEmail || !userPassword || !adminEmail || !adminPassword) return null;
  return {
    host,
    user: { email: userEmail, password: userPassword },
    admin: { email: adminEmail, password: adminPassword },
  };
}

export function devQuickLoginAvailable(
  requestHost: string | null,
  config: DevQuickLoginConfig | null,
): boolean {
  if (!config) return false;
  const requestHostname = hostname(requestHost);
  const configuredHostname = hostname(config.host);
  return Boolean(requestHostname && configuredHostname && requestHostname === configuredHostname);
}

export function createDevQuickLoginHandler(options: {
  config: DevQuickLoginConfig | null;
  loginProxy: LoginProxy;
}) {
  return async function handleDevQuickLogin(request: NextRequest): Promise<NextResponse> {
    if (!devQuickLoginAvailable(request.nextUrl.host, options.config)) {
      return problem(404, "NOT_FOUND");
    }
    const body = (await request.json().catch(() => null)) as { account?: unknown } | null;
    if (body?.account !== "USER" && body?.account !== "ADMIN") {
      return problem(400, "INVALID_ACCOUNT");
    }
    const credential = body.account === "USER" ? options.config?.user : options.config?.admin;
    if (!credential) return problem(404, "NOT_FOUND");

    const headers = new Headers(request.headers);
    headers.set("content-type", "application/json");
    headers.delete("content-length");
    const loginRequest = new NextRequest(request.url, {
      method: "POST",
      headers,
      body: JSON.stringify(credential),
    });
    return options.loginProxy(loginRequest, "/api/v1/auth/login");
  };
}

function value(candidate: string | undefined): string | null {
  const normalized = candidate?.trim();
  return normalized ? normalized : null;
}

function hostname(host: string | null): string | null {
  if (!host || host.includes(",")) return null;
  try {
    return new URL(`https://${host}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function problem(status: number, code: string): NextResponse {
  return NextResponse.json(
    { status, code },
    { status, headers: { "cache-control": "private, no-store" } },
  );
}
