export const PLATFORM_AUTH_COOKIE_NAME = "civic_ai_access_token";
export const PLATFORM_AUTH_COOKIE_PATH = "/";
export const PLATFORM_REFRESH_COOKIE_NAME = "civic_ai_refresh_token";
export const PLATFORM_REFRESH_COOKIE_PATH = "/api/v1/auth";
export const PLATFORM_PWA_REFRESH_COOKIE_NAME = "civic_ai_pwa_refresh_token";
export const PLATFORM_PWA_REFRESH_COOKIE_PATH = "/api/v1/auth/pwa";
export const PLATFORM_AUTH_FLOW_COOKIE_NAME = "__Host-civic-auth-flow";
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

export const CHAT_AUDIT_EXPORT_SCOPE = "chat:audit:exports";
export const CHAT_RESEARCH_EXPORT_SCOPE = "chat:research:exports";

export const VOTE_AUTH_SCOPES = [
  "vote:surveys:read",
  "vote:survey-responses:write",
  "vote:personas:read",
  "vote:tasks:read",
  "vote:predictions:write",
  "vote:submissions:read",
  "vote:submissions:write",
] as const;

export const VOTE_AUTH_SCOPE = VOTE_AUTH_SCOPES.join(" ");

export const RAG_AUTH_SCOPES = [
  "rag:documents:read",
  "rag:queries:write",
  "rag:jobs:read",
] as const;

export const VOTE_SURVEY_OUTBOX_REPLAY_SCOPE = "vote:survey-outbox-replays:write";
export const VOTE_PERSONA_GENERATION_RETRY_SCOPE = "vote:persona-generation-retries:write";

export const PLATFORM_AUTH_SCOPES = [
  ...CHAT_AUTH_SCOPES,
  ...VOTE_AUTH_SCOPES,
  ...RAG_AUTH_SCOPES,
] as const;

export const PLATFORM_AUTH_SCOPE = PLATFORM_AUTH_SCOPES.join(" ");

export type ChatAuthScope = (typeof CHAT_AUTH_SCOPES)[number];
export type VoteAuthScope = (typeof VOTE_AUTH_SCOPES)[number];
export type RagAuthScope = (typeof RAG_AUTH_SCOPES)[number];
export type PlatformAuthScope = (typeof PLATFORM_AUTH_SCOPES)[number];
