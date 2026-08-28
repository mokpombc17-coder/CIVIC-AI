import type { NextRequest } from "next/server";
import { proxyMainAuth } from "@/lib/api/main-auth-client";
import { createDevQuickLoginHandler, readDevQuickLoginConfig } from "@/lib/server/dev-quick-login";

const handleDevQuickLogin = createDevQuickLoginHandler({
  config: readDevQuickLoginConfig(process.env),
  loginProxy: proxyMainAuth,
});

export function POST(request: NextRequest) {
  return handleDevQuickLogin(request);
}
