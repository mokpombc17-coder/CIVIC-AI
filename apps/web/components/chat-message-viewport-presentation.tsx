import type { CSSProperties, RefCallback } from "react";
import { ChatMessageDateSeparator } from "@/components/chat-message-date-separator";
import { ChatMessageReadBoundary } from "@/components/chat-message-read-boundary";
import { ChatMessageItem } from "@/components/chat-message-item";
import type {
  ChatMessageItemViewModel,
  ChatMessageViewportItemViewModel,
} from "@/components/chat-room-view-model";

const HISTORY_RETRY_BUTTON_CLASS_NAME =
  "inline-flex min-h-10 items-center justify-center rounded-[var(--chat-publishing-radius-control)] border border-[var(--chat-publishing-color-primary)] bg-white px-4 text-sm font-bold text-[var(--chat-publishing-color-primary-emphasis)] transition hover:bg-[var(--chat-publishing-color-accent-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)]";

export function ChatMessageViewportOlderHistoryStatus({
  error,
  isLoading,
  onRetry,
}: Readonly<{
  error: string | null;
  isLoading: boolean;
  onRetry: () => void;
}>) {
  if (!isLoading && !error) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-5">
      {error ? (
        <div
          className="pointer-events-auto w-full max-w-[345px] rounded-[var(--chat-publishing-radius-card)] border border-[#ffc95c] bg-[#fff7e8] px-4 py-3 text-[var(--chat-publishing-color-text)] shadow-[0_8px_24px_rgba(18,20,23,0.12)]"
          data-chat-message-history-state="older-error"
          role="alert"
        >
          <p className="text-sm font-bold leading-5">이전 메시지를 불러오지 못했습니다.</p>
          <p className="mt-1 break-words text-xs leading-5 text-[#7a4b00]">{error}</p>
          <button
            className={`${HISTORY_RETRY_BUTTON_CLASS_NAME} mt-3`}
            onClick={onRetry}
            type="button"
          >
            이전 메시지 다시 불러오기
          </button>
        </div>
      ) : (
        <div
          className="flex items-center gap-2 rounded-full border border-[var(--chat-publishing-color-border)] bg-white px-3 py-2 text-xs font-medium text-[var(--chat-publishing-color-muted)] shadow-[0_4px_16px_rgba(18,20,23,0.1)]"
          data-chat-message-history-state="older-loading"
          role="status"
        >
          <span
            aria-hidden="true"
            className="size-4 animate-spin rounded-full border-2 border-[var(--chat-publishing-color-border)] border-t-[var(--chat-publishing-color-primary)]"
          />
          <span>이전 메시지를 불러오는 중…</span>
        </div>
      )}
    </div>
  );
}

export function ChatMessageViewportHistoryError({
  message,
  onRetry,
  title,
}: Readonly<{
  message: string;
  onRetry: () => void;
  title: string;
}>) {
  return (
    <div
      className="mx-5 mt-5 shrink-0 rounded-[var(--chat-publishing-radius-card)] border border-[#ffc95c] bg-[#fff7e8] p-5 text-[var(--chat-publishing-color-text)]"
      data-chat-message-history-state="error"
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
          <p className="text-base font-bold leading-6">{title}</p>
          <p className="mt-1 break-words text-sm leading-5 text-[#7a4b00]">{message}</p>
        </div>
      </div>
      <button
        className={`${HISTORY_RETRY_BUTTON_CLASS_NAME} mt-4 w-full`}
        onClick={onRetry}
        type="button"
      >
        다시 불러오기
      </button>
    </div>
  );
}

export function ChatMessageViewportHistoryNotice({ message }: { message: string }) {
  return (
    <div
      aria-live="polite"
      className="flex h-full min-h-[20rem] flex-col items-center justify-center px-6 text-center"
      data-chat-message-history-state="notice"
      role="status"
    >
      <span
        aria-hidden="true"
        className="mb-3 flex size-11 items-center justify-center rounded-full border border-[var(--chat-publishing-color-border)] bg-[var(--chat-publishing-color-neutral-soft)] text-[var(--chat-publishing-color-muted)]"
      >
        <svg fill="none" height="22" viewBox="0 0 24 24" width="22">
          <path
            d="M5 6.5h14v9H9l-4 3v-12Z"
            stroke="currentColor"
            strokeLinejoin="round"
            strokeWidth="1.7"
          />
        </svg>
      </span>
      <p className="text-sm font-medium leading-5 text-[var(--chat-publishing-color-muted)]">
        {message}
      </p>
    </div>
  );
}

export function ChatMessageViewportArrivalAnnouncement({
  announcement,
}: Readonly<{
  announcement: Readonly<{ id: number; message: string }> | null;
}>) {
  return (
    <p aria-atomic="true" aria-live="polite" aria-relevant="additions text" className="sr-only">
      {announcement ? <span key={announcement.id}>{announcement.message}</span> : null}
    </p>
  );
}

export function ChatMessageViewportNewMessagesButton({
  count,
  label,
  onJumpToLatest,
}: Readonly<{
  count: number;
  label?: string | undefined;
  onJumpToLatest: () => void;
}>) {
  if (count <= 0 && !label) {
    return null;
  }

  const accessibleLabel = label ?? `새 메시지 ${count}개, 최신 메시지로 이동`;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center px-5">
      <button
        aria-label={accessibleLabel}
        className="pointer-events-auto rounded-full bg-[var(--chat-publishing-color-primary)] px-4 py-2 text-sm font-bold text-white shadow-[0_8px_24px_rgba(18,20,23,0.16)] transition hover:bg-[var(--chat-publishing-color-primary-emphasis)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)]"
        onClick={onJumpToLatest}
        type="button"
      >
        {label ?? `새 메시지 ${count}개`} <span aria-hidden="true">↓</span>
      </button>
    </div>
  );
}

export function ChatMessageViewportVirtualRow({
  item,
  measureElement,
  onOpenMessageActions,
  start,
  targetMessageId,
  virtualIndex,
}: Readonly<{
  item: ChatMessageViewportItemViewModel;
  measureElement: RefCallback<HTMLLIElement>;
  onOpenMessageActions: (item: ChatMessageItemViewModel, trigger: HTMLButtonElement) => void;
  start: number;
  targetMessageId?: string | null;
  virtualIndex: number;
}>) {
  const style: CSSProperties = {
    left: 0,
    position: "absolute",
    top: 0,
    transform: `translateY(${start}px)`,
    width: "100%",
  };

  if (item.kind === "date-separator") {
    return (
      <ChatMessageDateSeparator
        date={item.date}
        ref={measureElement}
        renderKey={item.renderKey}
        style={style}
        virtualIndex={virtualIndex}
      />
    );
  }

  if (item.kind === "read-boundary") {
    return (
      <ChatMessageReadBoundary
        afterSequence={item.afterSequence}
        ref={measureElement}
        renderKey={item.renderKey}
        style={style}
        virtualIndex={virtualIndex}
      />
    );
  }

  return (
    <ChatMessageItem
      isNavigationTarget={item.item.messageId === targetMessageId}
      item={item.item}
      onOpenActions={onOpenMessageActions}
      ref={measureElement}
      style={style}
      virtualIndex={virtualIndex}
    />
  );
}
