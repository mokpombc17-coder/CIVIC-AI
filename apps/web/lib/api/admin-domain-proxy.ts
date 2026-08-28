import "server-only";

import type { NextRequest } from "next/server";
import { civicProductionServiceConfig } from "@/lib/server/civic-auth/production-service-config";
import { createResourceServerProxy, unavailableResourceServer } from "./resource-server-client";

export type AdminDomain = "chat" | "vote";

export async function proxyAdminDomain(
  domain: AdminDomain,
  request: NextRequest,
  upstreamPath: string,
  requiredScope: string,
) {
  const { browserOrigin, chatUrl, voteUrl } = civicProductionServiceConfig;
  const resourceUrl = domain === "chat" ? chatUrl : voteUrl;
  if (!browserOrigin || !resourceUrl) return unavailableResourceServer(request);
  return createResourceServerProxy({
    browserOrigin,
    resourceUrl: new URL(resourceUrl),
  })(request, upstreamPath, requiredScope);
}
