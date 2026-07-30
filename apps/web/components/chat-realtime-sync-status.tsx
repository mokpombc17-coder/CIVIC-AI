"use client";

import { getChatRealtimeQueryErrorPresentation } from "@/lib/chat/realtime/chat-realtime-query-error-presentation";

type ChatRealtimeSyncStatusProps = Readonly<{
  error: Error | null;
  isRecovering: boolean;
  isSynchronized: boolean;
  onRetry: () => void;
  visible: boolean;
}>;

export function ChatRealtimeSyncStatus({
  error,
  isRecovering,
  isSynchronized,
  onRetry,
  visible,
}: ChatRealtimeSyncStatusProps) {
  if (!visible) {
    return null;
  }

  if (error) {
    const presentation = getChatRealtimeQueryErrorPresentation(error);
    const handleAction =
      presentation.action === "retry"
        ? onRetry
        : presentation.action === "reload"
          ? () => window.location.reload()
          : null;

    return (
      <div className="border-t border-red-200 bg-red-50 px-5 py-4 text-red-950" role="alert">
        <p className="text-sm font-semibold">{presentation.title}</p>
        <p className="mt-1 text-xs opacity-80">{presentation.description}</p>
        {handleAction && presentation.actionLabel ? (
          <button className="secondary-button mt-3" onClick={handleAction} type="button">
            {presentation.actionLabel}
          </button>
        ) : null}
      </div>
    );
  }

  if (isRecovering) {
    return (
      <div
        aria-live="polite"
        className="border-t border-amber-200 bg-amber-50 px-5 py-3 text-amber-950"
        role="status"
      >
        <p className="text-sm font-semibold">놓친 메시지를 동기화하고 있습니다.</p>
        <p className="mt-1 text-xs opacity-75">
          복구가 끝날 때까지 새 메시지 입력을 잠시 기다려 주세요.
        </p>
      </div>
    );
  }

  if (!isSynchronized) {
    return (
      <div
        aria-live="polite"
        className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-slate-800"
        role="status"
      >
        <p className="text-sm font-semibold">실시간 이벤트 적용을 준비하고 있습니다.</p>
      </div>
    );
  }

  return null;
}
