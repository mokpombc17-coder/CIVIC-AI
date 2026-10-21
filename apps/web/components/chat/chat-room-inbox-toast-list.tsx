"use client";

import type { RoomInboxToast } from "@/components/chat/use-chat-room-inbox-runtime";

type ChatRoomInboxToastListProps = Readonly<{
  onSelect: (roomId: string) => void;
  toasts: readonly RoomInboxToast[];
}>;

export function ChatRoomInboxToastList({ onSelect, toasts }: ChatRoomInboxToastListProps) {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <aside
      aria-label="새 채팅 메시지 알림"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 top-[calc(1rem+env(safe-area-inset-top))] z-50 ml-auto flex max-w-sm flex-col gap-3 sm:inset-x-auto sm:right-6 sm:top-6 sm:w-full"
    >
      {toasts.map((toast) => (
        <button
          key={toast.roomId}
          className="pointer-events-auto rounded-2xl border border-slate-200 bg-white p-4 text-left text-slate-950 shadow-xl transition hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          onClick={() => onSelect(toast.roomId)}
          type="button"
        >
          <span className="block font-semibold">
            {toast.roomName}
            {toast.count > 1 ? ` · 새 메시지 ${toast.count}개` : ""}
          </span>
          <span className="mt-1 line-clamp-2 block text-sm text-slate-600">{toast.preview}</span>
        </button>
      ))}
    </aside>
  );
}
