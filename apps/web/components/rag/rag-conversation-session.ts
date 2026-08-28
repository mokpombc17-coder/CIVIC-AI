import type { RagFeedbackValue } from "./rag-feedback";

export type Citation = Readonly<{
  document_version_id: string;
  page_number: number;
  page_count?: number;
  source_object_sha256: string;
  title?: string;
  source_kind?: string;
  source_url?: string;
  related_titles?: string[];
}>;

export type RagJob = Readonly<{
  job_id: string;
  session_id?: string;
  status: string;
  submitted_question?: string;
  answer?: string;
  citations?: Citation[];
  suggestions?: string[];
  failure_code?: string;
  feedback?: RagFeedbackValue;
}>;

export type Message = Readonly<{
  id: string;
  question: string;
  askedAt: string;
  answeredAt?: string;
  job?: RagJob;
}>;

export type RagConversationSnapshot = Readonly<{
  ownerUserId: string;
  sessionId: string | null;
  messages: Message[];
}>;

type RagConversationStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;
type RagConversationRemovalStorage = Pick<Storage, "removeItem">;

export const RAG_CONVERSATION_STORAGE_KEY = "civic:rag-conversation:v1";

export function writeRagConversationSnapshot(
  storage: RagConversationStorage,
  snapshot: RagConversationSnapshot,
): void {
  try {
    storage.setItem(RAG_CONVERSATION_STORAGE_KEY, JSON.stringify({ version: 1, ...snapshot }));
  } catch {
    // Browser privacy settings or storage quota may disable tab storage.
  }
}

export function readRagConversationSnapshot(
  storage: RagConversationStorage,
  ownerUserId: string,
): RagConversationSnapshot | null {
  try {
    const raw = storage.getItem(RAG_CONVERSATION_STORAGE_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!isStoredRagConversation(value) || value.ownerUserId !== ownerUserId) {
      storage.removeItem(RAG_CONVERSATION_STORAGE_KEY);
      return null;
    }
    return {
      ownerUserId: value.ownerUserId,
      sessionId: value.sessionId,
      messages: value.messages,
    };
  } catch {
    try {
      storage.removeItem(RAG_CONVERSATION_STORAGE_KEY);
    } catch {
      // Storage may be unavailable for both reads and writes.
    }
    return null;
  }
}

export function clearRagConversationSnapshot(storage: RagConversationRemovalStorage): void {
  try {
    storage.removeItem(RAG_CONVERSATION_STORAGE_KEY);
  } catch {
    // Storage may be unavailable in a privacy-restricted browser.
  }
}

export function latestPendingRagJobId(messages: ReadonlyArray<Message>): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message) continue;
    if (!message.job || (message.job.status !== "SUCCEEDED" && message.job.status !== "FAILED")) {
      return message.id;
    }
  }
  return null;
}

function isStoredRagConversation(value: unknown): value is {
  version: 1;
  ownerUserId: string;
  sessionId: string | null;
  messages: Message[];
} {
  if (!isRecord(value) || value.version !== 1 || typeof value.ownerUserId !== "string") {
    return false;
  }
  if (value.sessionId !== null && typeof value.sessionId !== "string") return false;
  return Array.isArray(value.messages) && value.messages.every(isStoredRagMessage);
}

function isStoredRagMessage(value: unknown): value is Message {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.question !== "string" ||
    typeof value.askedAt !== "string"
  ) {
    return false;
  }
  if (value.answeredAt !== undefined && typeof value.answeredAt !== "string") return false;
  return value.job === undefined || isStoredRagJob(value.job);
}

function isStoredRagJob(value: unknown): value is RagJob {
  if (!isRecord(value) || typeof value.job_id !== "string" || typeof value.status !== "string") {
    return false;
  }
  for (const field of ["session_id", "submitted_question", "answer", "failure_code"] as const) {
    if (value[field] !== undefined && typeof value[field] !== "string") return false;
  }
  if (
    value.feedback !== undefined &&
    value.feedback !== "HELPFUL" &&
    value.feedback !== "UNHELPFUL"
  ) {
    return false;
  }
  if (
    value.suggestions !== undefined &&
    (!Array.isArray(value.suggestions) ||
      !value.suggestions.every((suggestion) => typeof suggestion === "string"))
  ) {
    return false;
  }
  return (
    value.citations === undefined ||
    (Array.isArray(value.citations) && value.citations.every(isStoredCitation))
  );
}

function isStoredCitation(value: unknown): value is Citation {
  if (
    !isRecord(value) ||
    typeof value.document_version_id !== "string" ||
    !Number.isSafeInteger(value.page_number) ||
    typeof value.source_object_sha256 !== "string"
  ) {
    return false;
  }
  if (value.page_count !== undefined && !Number.isSafeInteger(value.page_count)) return false;
  for (const field of ["title", "source_kind", "source_url"] as const) {
    if (value[field] !== undefined && typeof value[field] !== "string") return false;
  }
  return (
    value.related_titles === undefined ||
    (Array.isArray(value.related_titles) &&
      value.related_titles.every((title) => typeof title === "string"))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
