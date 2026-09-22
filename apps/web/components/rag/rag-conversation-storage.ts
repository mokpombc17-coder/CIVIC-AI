type RagConversationRemovalStorage = Pick<Storage, "removeItem">;

export const RAG_CONVERSATION_STORAGE_KEY = "civic:rag-conversation:v1";
export const RAG_CONVERSATION_DRAFT_STORAGE_KEY = "civic:rag-conversation-draft:v1";

export function clearRagConversationSnapshot(storage?: RagConversationRemovalStorage): void {
  try {
    const target = storage ?? (typeof window === "undefined" ? null : window.sessionStorage);
    if (!target) return;
    clearRagConversationDraft(target);
    target.removeItem(RAG_CONVERSATION_STORAGE_KEY);
  } catch {
    // Storage may be unavailable in a privacy-restricted browser.
  }
}

export function clearRagConversationDraft(storage: RagConversationRemovalStorage): void {
  try {
    storage.removeItem(RAG_CONVERSATION_DRAFT_STORAGE_KEY);
  } catch {
    // Storage may be unavailable in a privacy-restricted browser.
  }
}
