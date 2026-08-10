export const PLATFORM_AUTH_COOKIE_NAME = "civic_ai_access_token";
export const PLATFORM_AUTH_COOKIE_PATH = "/";
export const PLATFORM_AUTH_AUDIENCE = "civic-ai-api";

export const CHAT_AUTH_SCOPES = [
  "chat:connect",
  "chat:rooms:read",
  "chat:rooms:write",
  "chat:messages:write",
  "chat:read-state:write",
] as const;

export const CHAT_AUTH_SCOPE = CHAT_AUTH_SCOPES.join(" ");

export const CHAT_ROOM_MEMBERSHIP_LIMIT_EXEMPT_SCOPE = "chat:rooms:membership-limit:exempt";

export type ChatAuthScope = (typeof CHAT_AUTH_SCOPES)[number];
