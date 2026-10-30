"use client";

import { getChatRealtimeQueryErrorPresentation } from "@/lib/chat/realtime/chat-realtime-query-error-presentation";

type ChatRealtimeSyncStatusProps = Readonly<{
  error: Error | null;
  onRetry: () => void;
  visible: boolean;
}>;

export function ChatRealtimeSyncStatus({ error, onRetry, visible }: ChatRealtimeSyncStatusProps) {
  if (!visible || !error) {
    return null;
  }

  const presentation = getChatRealtimeQueryErrorPresentation(error);
  const handleAction =
    presentation.action === "retry"
      ? onRetry
      : presentation.action === "reload"
        ? () => window.location.reload()
        : null;

  return (
    <div
      className="mx-4 mt-3 rounded-[var(--chat-publishing-radius-card)] border border-[#ffc95c] bg-[#fff7e8] px-4 py-4 text-[var(--chat-publishing-color-text)]"
      data-chat-message-history-state="sync-error"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-base font-bold text-[#8a5700]"
        >
          !
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold leading-6">{presentation.title}</p>
          <p className="mt-1 break-words text-sm leading-5 text-[#7a4b00]">
            {presentation.description}
          </p>
        </div>
      </div>
      {handleAction && presentation.actionLabel ? (
        <button
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-[var(--chat-publishing-radius-control)] border border-[var(--chat-publishing-color-primary)] bg-white px-4 text-sm font-bold text-[var(--chat-publishing-color-primary-emphasis)] transition hover:bg-[var(--chat-publishing-color-accent-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)]"
          onClick={handleAction}
          type="button"
        >
          {presentation.actionLabel}
        </button>
      ) : null}
    </div>
  );
}
