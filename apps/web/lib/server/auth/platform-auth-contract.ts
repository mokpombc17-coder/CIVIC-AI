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

export const VOTE_AUTH_SCOPES = [
  "vote:surveys:read",
  "vote:survey-responses:write",
  "vote:tasks:read",
  "vote:submissions:read",
  "vote:submissions:write",
] as const;

export const VOTE_AUTH_SCOPE = VOTE_AUTH_SCOPES.join(" ");

export const PLATFORM_AUTH_SCOPES = [...CHAT_AUTH_SCOPES, ...VOTE_AUTH_SCOPES] as const;

export const PLATFORM_AUTH_SCOPE = PLATFORM_AUTH_SCOPES.join(" ");

export type ChatAuthScope = (typeof CHAT_AUTH_SCOPES)[number];
export type VoteAuthScope = (typeof VOTE_AUTH_SCOPES)[number];
export type PlatformAuthScope = (typeof PLATFORM_AUTH_SCOPES)[number];
