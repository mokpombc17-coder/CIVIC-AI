type RouteDefinition = Readonly<{
  pattern: RegExp;
  methods: ReadonlySet<string>;
  requiresCsrf: boolean;
}>;

const routes: readonly RouteDefinition[] = [
  route("/api/v1/signup/flows", ["POST"]),
  dynamicRoute(/^\/api\/v1\/signup\/flows\/[^/]+\/complete$/, ["POST"]),
  route("/api/v1/signup/verification/verify", ["POST"]),
  route("/api/v1/signup/verification/resend", ["POST"]),
  route("/api/v1/auth/login", ["POST"]),
  route("/api/v1/auth/pwa/login", ["POST"]),
  route("/api/v1/auth/pwa/refresh", ["POST"]),
  route("/api/v1/auth/pwa/logout", ["POST"]),
  route("/api/v1/auth/2fa/verify", ["POST"]),
  route("/api/v1/auth/2fa/resend", ["POST"]),
  route("/api/v1/auth/me", ["GET"]),
  route("/api/v1/auth/csrf", ["GET"]),
  route("/api/v1/auth/refresh", ["POST"]),
  route("/api/v1/auth/logout", ["POST"]),
  route("/api/v1/auth/logout-all", ["POST"], true),
  route("/api/v1/auth/password-reset/request", ["POST"]),
  route("/api/v1/auth/password-reset/complete", ["POST"]),
  route("/api/v1/auth/reactivation/request", ["POST"]),
  route("/api/v1/auth/reactivation/complete", ["POST"]),
  route("/api/v1/account/profile", ["GET"]),
  route("/api/v1/account/profile", ["PATCH"], true),
  route("/api/v1/account/password", ["PUT"], true),
  route("/api/v1/account/2fa/enable", ["POST"], true),
  route("/api/v1/account/2fa/disable", ["POST"], true),
  route("/api/v1/account/deactivate", ["POST"], true),
  route("/api/v1/admin/users", ["GET"]),
  route("/api/v1/admin/user-labels", ["GET"]),
  dynamicRoute(/^\/api\/v1\/admin\/users\/[^/]+$/, ["GET"]),
  dynamicRoute(/^\/api\/v1\/admin\/users\/[^/]+\/roles$/, ["PUT"], true),
  route("/api/v1/admin/audit", ["GET"]),
  route("/api/v1/admin/feature-gates", ["GET"]),
  route("/api/v1/admin/privacy-operations", ["POST"], true),
  dynamicRoute(/^\/api\/v1\/admin\/privacy-operations\/[^/]+$/, ["GET"]),
];

export type MainAuthRouteMatch =
  | Readonly<{ requiresCsrf: boolean }>
  | Readonly<{ status: 404 }>
  | Readonly<{ status: 405; allowedMethods: readonly string[] }>;

export function matchMainAuthRoute(method: string, pathname: string): MainAuthRouteMatch {
  const candidates = routes.filter((candidate) => candidate.pattern.test(pathname));
  if (candidates.length === 0) return { status: 404 };
  const matched = candidates.find((candidate) => candidate.methods.has(method.toUpperCase()));
  if (matched) return { requiresCsrf: matched.requiresCsrf };
  return {
    status: 405,
    allowedMethods: [...new Set(candidates.flatMap((candidate) => [...candidate.methods]))],
  };
}

export function mainAuthProxyPath(segments: readonly string[]): string {
  return `/api/v1/${segments.map((segment) => encodeURIComponent(segment)).join("/")}`;
}

function route(
  pathname: string,
  methods: readonly string[],
  requiresCsrf = false,
): RouteDefinition {
  return dynamicRoute(new RegExp(`^${escapeRegExp(pathname)}$`), methods, requiresCsrf);
}

function dynamicRoute(
  pattern: RegExp,
  methods: readonly string[],
  requiresCsrf = false,
): RouteDefinition {
  return { pattern, methods: new Set(methods), requiresCsrf };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
