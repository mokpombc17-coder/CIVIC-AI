import type { CSSProperties, RefCallback } from "react";
import { ChatMessageDateSeparator } from "@/components/chat-message-date-separator";
import { ChatMessageReadBoundary } from "@/components/chat-message-read-boundary";
import { ChatMessageItem } from "@/components/chat-message-item";
import type {
  ChatMessageItemViewModel,
  ChatMessageViewportItemViewModel,
} from "@/components/chat-room-view-model";

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
          className="pointer-events-auto rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-red-950 shadow-sm"
          role="alert"
        >
          <p className="text-xs">{error}</p>
          <button className="secondary-button mt-2" onClick={onRetry} type="button">
            이전 메시지 다시 불러오기
          </button>
        </div>
      ) : (
        <p
          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 shadow-sm"
          role="status"
        >
          이전 메시지를 불러오는 중…
        </p>
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
      className="mx-5 mt-5 shrink-0 rounded-xl border border-red-200 bg-red-50 p-4 text-red-950"
      role="alert"
    >
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs opacity-80">{message}</p>
      <button className="secondary-button mt-3" onClick={onRetry} type="button">
        다시 불러오기
      </button>
    </div>
  );
}

export function ChatMessageViewportHistoryNotice({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-[20rem] items-center justify-center">
      <p className="text-center text-sm text-slate-500">{message}</p>
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
  onJumpToLatest,
}: Readonly<{
  count: number;
  onJumpToLatest: () => void;
}>) {
  if (count <= 0) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center px-5">
      <button
        aria-label={`새 메시지 ${count}개, 최신 메시지로 이동`}
        className="pointer-events-auto rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
        onClick={onJumpToLatest}
        type="button"
      >
        새 메시지 {count}개 <span aria-hidden="true">↓</span>
      </button>
    </div>
  );
}

export function ChatMessageViewportVirtualRow({
  item,
  measureElement,
  onOpenMessageActions,
  start,
  virtualIndex,
}: Readonly<{
  item: ChatMessageViewportItemViewModel;
  measureElement: RefCallback<HTMLLIElement>;
  onOpenMessageActions: (item: ChatMessageItemViewModel, trigger: HTMLButtonElement) => void;
  start: number;
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
      item={item.item}
      onOpenActions={onOpenMessageActions}
      ref={measureElement}
      style={style}
      virtualIndex={virtualIndex}
    />
  );
}
