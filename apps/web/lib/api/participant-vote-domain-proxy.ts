import "server-only";

import type { NextRequest } from "next/server";
import { civicProductionServiceConfig } from "@/lib/server/civic-auth/production-service-config";
import { createResourceServerProxy, unavailableResourceServer } from "./resource-server-client";
import type { ParticipantVoteRoute } from "./participant-vote-domain-policy";

export async function proxyParticipantVoteDomain(
  request: NextRequest,
  route: ParticipantVoteRoute,
) {
  const { browserOrigin, voteUrl } = civicProductionServiceConfig;
  if (!browserOrigin || !voteUrl) return unavailableResourceServer(request);
  return createResourceServerProxy({
    browserOrigin,
    resourceUrl: new URL(voteUrl),
  })(request, route.path, route.scope);
}
