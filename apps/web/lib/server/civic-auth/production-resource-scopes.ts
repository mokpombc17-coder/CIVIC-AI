/**
 * Production-only RAG scopes issued by Main/Auth and enforced by RAG.
 *
 * The existing local platform JWT fixture intentionally remains unchanged.
 * These values live in a separate module so adding RAG does not change the
 * Chat/Vote development contract.
 */
export const CIVIC_RAG_PARTICIPANT_SCOPES = [
  "rag:documents:read",
  "rag:queries:write",
  "rag:jobs:read",
] as const;

export const CIVIC_RAG_ADMIN_SCOPE = "rag:documents:write" as const;

export type CivicRagParticipantScope = (typeof CIVIC_RAG_PARTICIPANT_SCOPES)[number];
export type CivicRagScope = CivicRagParticipantScope | typeof CIVIC_RAG_ADMIN_SCOPE;
