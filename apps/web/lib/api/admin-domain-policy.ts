export type AdminDomainRoute = Readonly<{
  path: string;
  scope:
    | "chat:rooms:approve"
    | "simulation:billing:read"
    | "simulation:billing:write"
    | "simulation:tasks:read"
    | "simulation:tasks:run"
    | "vote:tasks:admin";
}>;

type RouteFailure = Readonly<{ allowedMethods: readonly string[]; status: 404 | 405 }>;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const chatId = /^(?!\.{1,2}$)[A-Za-z0-9._~-]{1,256}$/u;

export function matchChatAdminRoute(
  method: string,
  segments: readonly string[],
): AdminDomainRoute | RouteFailure {
  const normalizedMethod = method.toUpperCase();
  if (segments.length === 0)
    return allow(normalizedMethod, ["GET"], chatPath(segments), "chat:rooms:approve");
  if (segments.length === 1 && chatId.test(segments[0] ?? "")) {
    return allow(normalizedMethod, ["GET"], chatPath(segments), "chat:rooms:approve");
  }
  if (
    segments.length === 2 &&
    chatId.test(segments[0] ?? "") &&
    ["approve", "reject"].includes(segments[1] ?? "")
  ) {
    return allow(normalizedMethod, ["POST"], chatPath(segments), "chat:rooms:approve");
  }
  return { allowedMethods: [], status: 404 };
}

export function matchVoteTaskAdminRoute(
  method: string,
  segments: readonly string[],
): AdminDomainRoute | RouteFailure {
  const normalizedMethod = method.toUpperCase();
  if (segments.length === 0) {
    return allow(normalizedMethod, ["GET", "POST"], taskPath(segments), "vote:tasks:admin");
  }
  if (!uuid.test(segments[0] ?? "")) return { allowedMethods: [], status: 404 };
  if (segments.length === 1) {
    return allow(normalizedMethod, ["GET", "PUT"], taskPath(segments), "vote:tasks:admin");
  }
  if (segments.length !== 2) return { allowedMethods: [], status: 404 };
  const action = segments[1] ?? "";
  const methods =
    action === "schedule"
      ? ["POST", "PUT"]
      : action === "deadline"
        ? ["PUT"]
        : ["open-now", "start-now", "close", "cancel"].includes(action)
          ? ["POST"]
          : ["result-summary", "result-view"].includes(action)
            ? ["GET"]
            : [];
  return methods.length > 0
    ? allow(normalizedMethod, methods, taskPath(segments), "vote:tasks:admin")
    : { allowedMethods: [], status: 404 };
}

export function matchSimulationTaskRoute(
  method: string,
  segments: readonly string[],
): AdminDomainRoute | RouteFailure {
  const normalizedMethod = method.toUpperCase();
  if (!uuid.test(segments[0] ?? "") || segments[1] !== "simulations") {
    return { allowedMethods: [], status: 404 };
  }
  if (segments.length === 3 && segments[2] === "preview") {
    return allow(normalizedMethod, ["POST"], taskPath(segments), "simulation:tasks:read");
  }
  if (segments.length !== 2) return { allowedMethods: [], status: 404 };
  const scope = normalizedMethod === "POST" ? "simulation:tasks:run" : "simulation:tasks:read";
  return allow(normalizedMethod, ["GET", "POST"], taskPath(segments), scope);
}

export function matchSimulationBillingRoute(
  method: string,
  segments: readonly string[],
): AdminDomainRoute | RouteFailure {
  const normalizedMethod = method.toUpperCase();
  const read = (allowedMethods: readonly string[] = ["GET"]) =>
    allow(
      normalizedMethod,
      allowedMethods,
      simulationBillingPath(segments),
      "simulation:billing:read",
    );
  const write = (allowedMethods: readonly string[] = ["POST"]) =>
    allow(
      normalizedMethod,
      allowedMethods,
      simulationBillingPath(segments),
      "simulation:billing:write",
    );
  if (segments.length === 1 && ["wallet", "policies"].includes(segments[0] ?? "")) {
    return read();
  }
  if (segments.length === 1 && segments[0] === "coupons") return write();
  if (segments.length === 2 && segments[0] === "coupons" && segments[1] === "redeem") {
    return write();
  }
  if (
    segments.length === 2 &&
    ((segments[0] === "reports" && ["daily", "daily.csv"].includes(segments[1] ?? "")) ||
      (segments[0] === "imports" && segments[1] === "latest"))
  ) {
    return read();
  }
  if (
    segments.length === 3 &&
    segments[0] === "policies" &&
    ["fx", "provider-prices", "model-prices"].includes(segments[1] ?? "") &&
    segments[2] === "drafts"
  ) {
    return write();
  }
  if (
    segments.length === 4 &&
    segments[0] === "policies" &&
    ["fx", "provider-prices", "model-prices"].includes(segments[1] ?? "") &&
    /^[1-9]\d*$/u.test(segments[2] ?? "") &&
    segments[3] === "activate"
  ) {
    return write();
  }
  return { allowedMethods: [], status: 404 };
}

export function matchSimulationAdminRoute(
  method: string,
  segments: readonly string[],
): AdminDomainRoute | RouteFailure {
  const normalizedMethod = method.toUpperCase();
  if (!uuid.test(segments[0] ?? "")) return { allowedMethods: [], status: 404 };
  if (segments.length === 1) {
    return allow(normalizedMethod, ["GET"], simulationPath(segments), "simulation:tasks:read");
  }
  if (segments.length !== 2) return { allowedMethods: [], status: 404 };
  const action = segments[1] ?? "";
  if (action === "cancel") {
    return allow(normalizedMethod, ["POST"], simulationPath(segments), "simulation:tasks:run");
  }
  if (action === "results") {
    return allow(normalizedMethod, ["GET"], simulationPath(segments), "simulation:tasks:read");
  }
  return { allowedMethods: [], status: 404 };
}

export function matchSimulationOptionsRoute(method: string): AdminDomainRoute | RouteFailure {
  return allow(
    method.toUpperCase(),
    ["GET"],
    "/api/v1/admin/simulation-options",
    "simulation:tasks:read",
  );
}

function allow(
  method: string,
  allowedMethods: readonly string[],
  path: string,
  scope: AdminDomainRoute["scope"],
): AdminDomainRoute | RouteFailure {
  return allowedMethods.includes(method) ? { path, scope } : { allowedMethods, status: 405 };
}

function chatPath(segments: readonly string[]): string {
  return path("/api/v1/admin/room-creation-requests", segments);
}

function taskPath(segments: readonly string[]): string {
  return path("/api/v1/admin/tasks", segments);
}

function simulationPath(segments: readonly string[]): string {
  return path("/api/v1/admin/simulations", segments);
}

function simulationBillingPath(segments: readonly string[]): string {
  return path("/api/v1/admin/simulation-billing", segments);
}

function path(prefix: string, segments: readonly string[]): string {
  return segments.length === 0
    ? prefix
    : `${prefix}/${segments.map((segment) => encodeURIComponent(segment)).join("/")}`;
}
