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
      className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-red-950"
      role="alert"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{presentation.title}</p>
          <p className="mt-0.5 text-xs opacity-75">{presentation.description}</p>
        </div>
        {handleAction && presentation.actionLabel ? (
          <button
            className="shrink-0 rounded-lg border border-current px-3 py-1.5 text-xs font-semibold"
            onClick={handleAction}
            type="button"
          >
            {presentation.actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
