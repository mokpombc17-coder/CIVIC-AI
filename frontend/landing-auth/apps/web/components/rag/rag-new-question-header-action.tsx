"use client";

export const RAG_NEW_QUESTION_REQUEST_EVENT = "civic:rag-new-question-request";

export function RagNewQuestionHeaderAction({ disabled = false }: Readonly<{ disabled?: boolean }>) {
  return (
    <button
      aria-haspopup="dialog"
      aria-label="새 대화"
      className="civic-rag-header-new-question-action"
      disabled={disabled}
      onClick={() => window.dispatchEvent(new Event(RAG_NEW_QUESTION_REQUEST_EVENT))}
      title="새 대화"
      type="button"
    >
      <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
        <path d="M12 5v14M5 12h14" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    </button>
  );
}
