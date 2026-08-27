import "server-only";

import type { NextRequest } from "next/server";
import { civicProductionServiceConfig } from "@/lib/server/civic-auth/production-service-config";
import { createResourceServerProxy, unavailableResourceServer } from "./resource-server-client";

export type AdminDomain = "chat" | "simulation" | "vote";

export async function proxyAdminDomain(
  domain: AdminDomain,
  request: NextRequest,
  upstreamPath: string,
  requiredScope: string,
) {
  const { browserOrigin, chatUrl, simulationUrl, voteUrl } = civicProductionServiceConfig;
  const resourceUrl = domain === "chat" ? chatUrl : domain === "vote" ? voteUrl : simulationUrl;
  if (!browserOrigin || !resourceUrl) return unavailableResourceServer(request);
  return createResourceServerProxy({
    browserOrigin,
    resourceUrl: new URL(resourceUrl),
  })(request, upstreamPath, requiredScope);
}
