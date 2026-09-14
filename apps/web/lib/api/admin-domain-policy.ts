export type AdminDomainRoute = Readonly<{
  path: string;
  scope:
    | "chat:rooms:approve"
    | "chat:categories:manage"
    | "chat:rooms:read"
    | "chat:audit:exports"
    | "vote:tasks:admin";
}>;

type RouteFailure = Readonly<{ allowedMethods: readonly string[]; status: 404 | 405 }>;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
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

export function matchChatCategoryAdminRoute(
  method: string,
  segments: readonly string[],
): AdminDomainRoute | RouteFailure {
  const normalizedMethod = method.toUpperCase();
  if (segments.length === 0) {
    return allow(
      normalizedMethod,
      ["GET", "POST"],
      chatCategoryPath(segments),
      "chat:categories:manage",
    );
  }
  if (segments.length === 1 && chatId.test(segments[0] ?? "")) {
    return allow(
      normalizedMethod,
      ["GET", "PATCH", "DELETE"],
      chatCategoryPath(segments),
      "chat:categories:manage",
    );
  }
  return { allowedMethods: [], status: 404 };
}

export function matchChatRoomCategoryAssignmentRoute(
  method: string,
  roomId: string,
): AdminDomainRoute | RouteFailure {
  if (!chatId.test(roomId)) return { allowedMethods: [], status: 404 };
  return allow(
    method.toUpperCase(),
    ["PUT"],
    `/api/v1/admin/rooms/${encodeURIComponent(roomId)}/categories`,
    "chat:categories:manage",
  );
}

export function matchChatAdminRoomListRoute(method: string): AdminDomainRoute | RouteFailure {
  return allow(method.toUpperCase(), ["GET"], "/api/v1/admin/rooms", "chat:categories:manage");
}

export function matchChatAdminRoomCloseRoute(
  method: string,
  roomId: string,
): AdminDomainRoute | RouteFailure {
  if (!uuid.test(roomId)) return { allowedMethods: [], status: 404 };
  return allow(
    method.toUpperCase(),
    ["POST"],
    `/api/v1/admin/rooms/${encodeURIComponent(roomId)}/commands/close`,
    "chat:rooms:approve",
  );
}

export function matchChatRoomDetailRoute(
  method: string,
  roomId: string,
): AdminDomainRoute | RouteFailure {
  if (!chatId.test(roomId)) return { allowedMethods: [], status: 404 };
  return allow(
    method.toUpperCase(),
    ["GET"],
    `/api/v1/rooms/${encodeURIComponent(roomId)}`,
    "chat:rooms:read",
  );
}

export function matchChatRoomListRoute(method: string): AdminDomainRoute | RouteFailure {
  return allow(method.toUpperCase(), ["GET"], "/api/v1/rooms", "chat:rooms:read");
}

export function matchChatConversationExportRoute(
  method: string,
  roomId: string,
): AdminDomainRoute | RouteFailure {
  if (!chatId.test(roomId)) return { allowedMethods: [], status: 404 };
  return allow(
    method.toUpperCase(),
    ["POST"],
    `/api/v1/admin/rooms/${encodeURIComponent(roomId)}/conversation-exports`,
    "chat:audit:exports",
  );
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
      : action === "preparation"
        ? ["POST"]
        : action === "deadline"
          ? ["PUT"]
          : ["open-now", "start-now", "close", "cancel", "opinion-map-generation"].includes(action)
            ? ["POST"]
            : ["progress-summary", "result-summary", "result-view"].includes(action)
              ? ["GET"]
              : [];
  return methods.length > 0
    ? allow(normalizedMethod, methods, taskPath(segments), "vote:tasks:admin")
    : { allowedMethods: [], status: 404 };
}

export function matchOpinionMapGenerationAdminRoute(
  method: string,
  segments: readonly string[],
): AdminDomainRoute | RouteFailure {
  if (segments.length !== 1 || segments[0] !== "unavailable") {
    return { allowedMethods: [], status: 404 };
  }
  return allow(
    method.toUpperCase(),
    ["GET"],
    "/api/v1/admin/opinion-map-generations/unavailable",
    "vote:tasks:admin",
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

function chatCategoryPath(segments: readonly string[]): string {
  return path("/api/v1/admin/room-categories", segments);
}

function taskPath(segments: readonly string[]): string {
  return path("/api/v1/admin/tasks", segments);
}

function path(prefix: string, segments: readonly string[]): string {
  return segments.length === 0
    ? prefix
    : `${prefix}/${segments.map((segment) => encodeURIComponent(segment)).join("/")}`;
}
