import Link from "next/link";
import type { ChatRoomEntryErrorPresentation } from "@/lib/chat/chat-room-entry-error-presentation";

export type ChatRoomEntryErrorViewModel = ChatRoomEntryErrorPresentation &
  Readonly<{
    onRetry: () => void;
  }>;

export function ChatRoomEntryError({ error }: { error: ChatRoomEntryErrorViewModel }) {
  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-white px-4 py-4">
      <section
        className="flex min-h-[204px] flex-col rounded-[var(--chat-publishing-radius-card)] border border-[#ffc95c] bg-[#fff7e8] px-4 pt-[18px] pb-[18px]"
        role="alert"
      >
        <h2 className="text-base font-bold leading-6 text-[#8a4a08]">{error.title}</h2>
        <p className="mt-2 text-sm leading-[21px] text-[var(--chat-publishing-color-text)]">
          {error.detail}
        </p>

        <div className="mt-auto flex flex-wrap gap-2 pt-4">
          {error.action === "return-to-list" ? (
            <Link
              className="inline-flex h-12 min-w-[131px] items-center justify-center rounded-[var(--chat-publishing-radius-control)] bg-[var(--chat-publishing-color-primary)] px-4 text-base leading-5 font-bold text-white transition hover:bg-[var(--chat-publishing-color-primary-emphasis)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)]"
              href="/chat"
            >
              채팅방 목록
            </Link>
          ) : (
            <button
              className="inline-flex h-12 min-w-[131px] items-center justify-center rounded-[var(--chat-publishing-radius-control)] bg-[var(--chat-publishing-color-primary)] px-4 text-base leading-5 font-bold text-white transition hover:bg-[var(--chat-publishing-color-primary-emphasis)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-publishing-color-primary)]"
              onClick={error.onRetry}
              type="button"
            >
              다시 시도
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
