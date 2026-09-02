export type ParticipantVoteRoute = Readonly<{
  path: string;
  scope: "vote:surveys:read" | "vote:survey-responses:write";
}>;

type RouteFailure = Readonly<{ allowedMethods: readonly string[]; status: 404 | 405 }>;

const participantVoteRoutes = Object.freeze({
  "service-eligibility": {
    methods: ["GET"],
    path: "/api/v1/me/service-eligibility",
    scope: "vote:surveys:read",
  },
  "surveys/current": {
    methods: ["GET"],
    path: "/api/v1/me/surveys/current",
    scope: "vote:surveys:read",
  },
  "survey-responses": {
    methods: ["GET", "POST"],
    path: "/api/v1/me/survey-responses",
    scope: {
      GET: "vote:surveys:read",
      POST: "vote:survey-responses:write",
    },
  },
  "survey-responses/latest": {
    methods: ["GET"],
    path: "/api/v1/me/survey-responses/latest",
    scope: "vote:surveys:read",
  },
} as const);

export function matchParticipantVoteRoute(
  method: string,
  segments: readonly string[],
): ParticipantVoteRoute | RouteFailure {
  const routeKey = segments.join("/") as keyof typeof participantVoteRoutes;
  const route = participantVoteRoutes[routeKey];
  if (!route) return { allowedMethods: [], status: 404 };

  const normalizedMethod = method.toUpperCase();
  const allowedMethods: readonly string[] = route.methods;
  if (!allowedMethods.includes(normalizedMethod)) return { allowedMethods, status: 405 };

  const scope =
    typeof route.scope === "string"
      ? route.scope
      : route.scope[normalizedMethod as keyof typeof route.scope];
  if (!scope) return { allowedMethods, status: 405 };
  return { path: route.path, scope };
}
